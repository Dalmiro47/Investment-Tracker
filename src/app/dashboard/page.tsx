"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { aggregateByType } from '@/lib/portfolio';
import { useKrakenYearlySummary } from '@/hooks/useKrakenYearlySummary';
import PortfolioSummary from '@/components/portfolio-summary';
import { useAuth } from '@/hooks/use-auth';
import type { YearFilter, Investment, Transaction, EtfSimSummary, TaxSettings } from '@/lib/types';
import type { SavingsRateChange } from '@/lib/types-savings';
import { getInvestments, getAllTransactions } from '@/features/portfolio/actions';
import { getAllEtfSummaries, getTaxSettings, getAllRateSchedules } from '@/lib/firestore';
import { useFuturesPositions } from '@/hooks/useFuturesPositions';

export default function DashboardPage() {
  const { user } = useAuth();
  const [yearFilter, setYearFilter] = useState<YearFilter>({ kind: 'all', mode: 'holdings' });
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [transactionsMap, setTransactionsMap] = useState<Record<string, Transaction[]>>({});
  const [etfSummaries, setEtfSummaries] = useState<EtfSimSummary[]>([]);
  const [taxSettings, setTaxSettings] = useState<TaxSettings | null>(null);
  const [rateSchedulesMap, setRateSchedulesMap] = useState<Record<string, SavingsRateChange[]>>({});
  const [sellYears, setSellYears] = useState<number[]>([]);
  const [isTaxView, setIsTaxView] = useState(false);
  
  const krakenSummary = useKrakenYearlySummary(
    user?.uid ?? undefined,
    yearFilter.kind === 'year' ? yearFilter.year : yearFilter.kind === 'all' ? null : new Date().getFullYear()
  );

  // --- FIX START: Closing parenthesis added below ---
  const { positions: futuresPositions } = useFuturesPositions({ 
    userId: user?.uid 
  }); 
  // --- FIX END ---

  console.log('📊 Futures Positions from hook:', {
    positions: futuresPositions,
    length: futuresPositions?.length,
    type: typeof futuresPositions,
    isArray: Array.isArray(futuresPositions)
  });

  if (futuresPositions && futuresPositions.length > 0) {
    console.log('📋 Detailed Position Data:', futuresPositions.map(p => ({
      asset: p.asset,
      status: p.status,
      statusType: typeof p.status,
      statusTrimmed: p.status?.trim(),
      statusUpperCase: p.status?.trim().toUpperCase()
    })));
  }

  const [futuresLive, setFuturesLive] = useState({
    unrealizedPnLSum: 0,
    totalNotionalEur: 0,
    totalEntryValueEur: 0,
  });

  // Fetch live prices for futures positions
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    const updatePrices = async () => {
      let uPnL = 0;
      let totalNotional = 0;
      let totalEntryValue = 0;

      for (const pos of (futuresPositions || [])) {
        if (pos.status?.trim().toUpperCase() !== 'OPEN') continue;

        const cleanAsset = pos.asset.split('/')[0].split(' ')[0].split('-')[0].toUpperCase();
        
        try {
          const res = await fetch(`/api/kraken/prices?asset=${cleanAsset}`);
          const data = await res.json();
          const markPrice = Number(data.price);

          if (markPrice > 0) {
            const entryPrice = Number(pos.entryPrice || 0);
            const qty = Number(pos.size || 0); // Cantidad de monedas (e.g., 550 ADA)
            const rate = Number(pos.exchangeRate || 1);

            // 1. Cost Basis (Entry Notional en EUR)
            const entryValueEur = qty * entryPrice * rate;

            // 2. P&L Real para SHORT y LONG
            // SHORT: (Entrada - Actual) * Cantidad → Si entrada > actual = Ganancia
            // LONG: (Actual - Entrada) * Cantidad → Si actual > entrada = Ganancia
            const diffUsd = pos.side === 'SHORT' ? (entryPrice - markPrice) * qty : (markPrice - entryPrice) * qty;
            const pnlEur = diffUsd * rate;

            // 3. Market Value (Nocional Actual en EUR)
            const marketValueEur = qty * markPrice * rate;

            uPnL += pnlEur;
            totalNotional += marketValueEur;
            totalEntryValue += entryValueEur;
          }
        } catch (e) { console.error(`Error en ${cleanAsset}`); }
      }

      setFuturesLive({ unrealizedPnLSum: uPnL, totalNotionalEur: totalNotional, totalEntryValueEur: totalEntryValue });
    };

    updatePrices();
    intervalId = setInterval(updatePrices, 30000);

    return () => clearInterval(intervalId);
  }, [futuresPositions]);

  // Fetch investments and transactions
  useEffect(() => {
    const fetchData = async () => {
      if (!user?.uid) return;
      
      try {
        const [investmentsData, transactionsData, taxSettingsData] = await Promise.all([
          getInvestments(user.uid),
          getAllTransactions(user.uid),
          getTaxSettings(user.uid)
        ]);
        
        setInvestments(investmentsData);
        setTransactionsMap(transactionsData);
        setTaxSettings(taxSettingsData);
        
        const rateSchedules = await getAllRateSchedules(user.uid, investmentsData);
        setRateSchedulesMap(rateSchedules);
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };

    fetchData();
  }, [user]);

  // Fetch ETF summaries
  useEffect(() => {
    const fetchEtfSummaries = async () => {
      if (!user?.uid) return;
      
      try {
        const summaries = await getAllEtfSummaries(user.uid);
        setEtfSummaries(summaries);
      } catch (error) {
        console.error('Error fetching ETF summaries:', error);
      }
    };

    fetchEtfSummaries();
  }, [user]);

  // Update: Ensure live values are passed to the aggregator
  const summaryData = useMemo(() => {
    // 1. Calculate the visibility flag explicitly - Ensure futuresPositions is always an array
    const positionsArray = Array.isArray(futuresPositions) ? futuresPositions : [];
    
    const hasOpenPositions = positionsArray.length > 0 && positionsArray
      .some(p => p.status?.trim().toUpperCase() === 'OPEN');

    console.log('✅ Calculated hasOpenPositions:', hasOpenPositions, 'from', positionsArray.length, 'positions');

    // 2. HEAVY LIFTING: Precise Argument Mapping
    return aggregateByType(
      investments,           // 1
      transactionsMap,       // 2
      etfSummaries,          // 3
      yearFilter,            // 4
      isTaxView ? taxSettings : null, // 5
      rateSchedulesMap,      // 6
      krakenSummary,         // 7
      futuresLive.unrealizedPnLSum,   // 8 (krakenUnrealized)
      futuresLive.totalNotionalEur,   // 9 (krakenOpenNotional)
      futuresLive.totalEntryValueEur, // 10 (krakenEntryValueEur)
      hasOpenPositions,      // 11 (hasOpenPositions)
      0                      // 12 (krakenClosedRealizedPL) - calculated from closed positions in main page
    );
  }, [
    investments, transactionsMap, etfSummaries, yearFilter, 
    isTaxView, taxSettings, rateSchedulesMap, krakenSummary, 
    futuresLive, futuresPositions
  ]);

  return (
    <div>
      <PortfolioSummary 
        summaryData={summaryData}
        sellYears={sellYears}
        isTaxView={isTaxView}
        taxSettings={taxSettings}
        yearFilter={yearFilter}
        onYearFilterChange={setYearFilter}
        userId={user?.uid}
      />
    </div>
  );
}
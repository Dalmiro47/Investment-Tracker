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

  const { positions: futuresPositions } = useFuturesPositions({ 
    userId: user?.uid,
    useMockData: true // Temporary: Enable mock data for testing
  });

  console.log('📊 Futures Positions:', futuresPositions);

  const [futuresLive, setFuturesLive] = useState({
    unrealizedPnLSum: 0,
    totalNotionalEur: 0,
    totalEntryValueEur: 0,
  });

  // Fetch live prices for futures positions
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    const updatePrices = async () => {
      if (!futuresPositions || futuresPositions.length === 0) {
        console.log('⚠️ No futures positions found');
        setFuturesLive({ unrealizedPnLSum: 0, totalNotionalEur: 0, totalEntryValueEur: 0 });
        return;
      }
      
      console.log(`🔄 Updating prices for ${futuresPositions.length} positions...`);
      let unrealizedPnLSum = 0;
      let totalNotionalEur = 0;
      let totalEntryValueEur = 0;

      for (const pos of futuresPositions) {
        // Robust status check
        const isPosOpen = pos.status?.trim().toUpperCase() === 'OPEN';
        console.log(`  ➡️ ${pos.asset}: status=${pos.status}, isPosOpen=${isPosOpen}`);
        if (!isPosOpen) continue;

        // HEAVY LIFTING: Normalización del Asset
        // Convierte "ETH/USD Perp" o "eth-usd" en "ETH" para que route.ts lo entienda
        const cleanAsset = pos.asset.split('/')[0].split(' ')[0].split('-')[0].toUpperCase();

        try {
          const response = await fetch(`/api/kraken/prices?asset=${cleanAsset}`);
          const data = await response.json();
          
          // Force number conversion
          const markPrice = Number(data.price);
          console.log(`📡 Price for ${cleanAsset}: ${markPrice}`);

          // Only calculate if we got a valid price
          if (markPrice > 0) {
            const entryPrice = Number(pos.entryPrice || 0);
            const size = Number(pos.size || 0);
            const rate = Number(pos.exchangeRate || 1);

            // Cálculo de P&L (Invertido para SHORT)
            const diff = markPrice - entryPrice;
            const unrealized = diff * size * rate;
            const pnl = pos.side === 'SHORT' ? -unrealized : unrealized;

            unrealizedPnLSum += pnl;
            totalNotionalEur += size * markPrice * rate;
            totalEntryValueEur += size * entryPrice * rate;
            console.log(`    ✅ ${cleanAsset}: PnL=${pnl.toFixed(2)}€, Notional=${(size * markPrice * rate).toFixed(2)}€`);
          } else {
            console.log(`    ⚠️ ${cleanAsset}: Invalid price ${markPrice}`);
          }
        } catch (err) {
          console.error(`    ❌ ${cleanAsset}: Fetch error`, err);
          // Ignore individual fetch errors
        }
      }

      console.log(`💰 Final totals: PnL=${unrealizedPnLSum.toFixed(2)}€, Notional=${totalNotionalEur.toFixed(2)}€, Entry=${totalEntryValueEur.toFixed(2)}€`);
      setFuturesLive(prev => ({ ...prev, unrealizedPnLSum, totalNotionalEur, totalEntryValueEur }));
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

  const summaryData = useMemo(() => {
    // Track if there are any open positions to control visibility (bulletproof)
    const hasOpenPositions = (futuresPositions ?? []).some(p => p.status?.trim().toUpperCase() === 'OPEN');
    
    // Temporary console.table for debugging data flow
    console.table({ hasOpen: hasOpenPositions, uPnL: futuresLive.unrealizedPnLSum, realized: krakenSummary?.taxableAmount });
    
    // Bridge verification: Ensure hasOpenPositions reaches aggregator
    console.log('🚀 Pushing to Aggregator:', { hasOpenPositions, unrealized: futuresLive.unrealizedPnLSum });
    
    return aggregateByType(
      investments,
      transactionsMap,
      etfSummaries,
      yearFilter,
      isTaxView ? taxSettings : null,
      rateSchedulesMap,
      krakenSummary,
      futuresLive.unrealizedPnLSum,
      futuresLive.totalNotionalEur,
      futuresLive.totalEntryValueEur,
      hasOpenPositions
    );
  }, [investments, transactionsMap, etfSummaries, yearFilter, isTaxView, taxSettings, rateSchedulesMap, krakenSummary, futuresLive, futuresPositions]);

  return (
    <div>
      <PortfolioSummary 
        summaryData={summaryData}
        sellYears={sellYears}
        isTaxView={isTaxView}
        taxSettings={taxSettings}
        yearFilter={yearFilter}
        onYearFilterChange={setYearFilter}
      />
    </div>
  );
}
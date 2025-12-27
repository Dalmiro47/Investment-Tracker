
"use client";

import React from 'react';
import { useFuturesPositions } from '@/hooks/useFuturesPositions';
import { useClosedPositions } from '@/hooks/useClosedPositions';
import { useKrakenYearlySummary } from '@/hooks/useKrakenYearlySummary';
import type { Investment, InvestmentType, InvestmentStatus, SortKey, InvestmentFormValues, Transaction, YearFilter, TaxSettings, EtfSimSummary } from '@/lib/types';
import { addInvestment, deleteInvestment, getInvestments, updateInvestment, getAllTransactionsForInvestments, getSellYears, getTaxSettings, updateTaxSettings, getAllEtfSummaries, getAllRateSchedules, addTransaction } from '@/lib/firestore';
import { refreshInvestmentPrices } from './actions';
import DashboardHeader from '@/components/dashboard-header';
import InvestmentCard from '@/components/investment-card';
import PortfolioSummary, { type PortfolioSummaryHandle } from '@/components/portfolio-summary';
import { InvestmentForm } from '@/components/investment-form';
import { TaxSettingsDialog } from '@/components/tax-settings-dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle, SlidersHorizontal, Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from "@/hooks/use-toast";
import { useAutoRefreshPrices } from '@/hooks/use-auto-refresh-prices';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { TransactionHistoryDialog } from '@/components/transaction-history-dialog';
import { performancePct } from '@/lib/types';
import { calculatePositionMetrics, aggregateByType } from '@/lib/portfolio';
import InvestmentListView from '@/components/investment-list';
import type { SavingsRateChange } from '@/lib/types-savings';
import RateScheduleDialog from "@/components/rate-schedule-dialog";
import EtfPlansButton from '@/components/etf/EtfPlansButton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Card, CardContent } from '@/components/ui/card';
import { MobileAppShell } from '@/components/shell/MobileAppShell';
import { MobileFilters } from '@/components/filters/MobileFilters';
import { useIsMobile } from '@/hooks/use-mobile';
import { FifoSellDialog } from "@/components/fifo-sell-dialog";
import FuturesPositionsTable from '@/components/futures-positions-table';
import KrakenTaxSummaryCards from '@/components/KrakenTaxSummaryCards';

const todayISO = () => new Date().toISOString().slice(0,10);
const getCurrentRate = (rates?: SavingsRateChange[]) => {
  if (!rates || rates.length === 0) return null;
  const t = todayISO();
  const eligible = rates.filter(r => r.from <= t).sort((a,b)=>a.from.localeCompare(b.from));
  return eligible.length ? eligible[eligible.length-1].annualRatePct : rates[0].annualRatePct;
};

type TypeFilterValue = InvestmentType | 'All' | 'Futures';

function DashboardPageContent() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [investments, setInvestments] = React.useState<Investment[]>([]);
  const [etfSummaries, setEtfSummaries] = React.useState<EtfSimSummary[]>([]);
  const [transactionsMap, setTransactionsMap] = React.useState<Record<string, Transaction[]>>({});
  const [rateSchedulesMap, setRateSchedulesMap] = React.useState<Record<string, SavingsRateChange[]>>({});
  const [sellYears, setSellYears] = React.useState<number[]>([]);
  const [initialLoading, setInitialLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isTaxView, setIsTaxView] = React.useState(false);
  const [typeFilter, setTypeFilter] = React.useState<TypeFilterValue>('All');
  const [statusFilter, setStatusFilter] = React.useState<InvestmentStatus | 'All'>('All');
  const [sortKey, setSortKey] = React.useState<SortKey>('purchaseDate');
  const [investmentNameFilter, setInvestmentNameFilter] = React.useState<'All' | string>('All');
  const [viewMode, setViewMode] = React.useState<'grid' | 'list'>('grid');
  const [listMode, setListMode] = React.useState<'aggregated' | 'flat'>('aggregated');

  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingInvestment, setEditingInvestment] = React.useState<Investment | undefined>(undefined);
  const [prefillType, setPrefillType] = React.useState<InvestmentType | undefined>(undefined);
  
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [deletingInvestmentId, setDeletingInvestmentId] = React.useState<string | null>(null);

  const [isHistoryOpen, setIsHistoryOpen] = React.useState(false);
  const [historyDialogView, setHistoryDialogView] = React.useState<'list' | 'form'>('list');
  const [viewingHistoryInvestment, setViewingHistoryInvestment] = React.useState<Investment | undefined>(undefined);

  const [isTaxSettingsOpen, setIsTaxSettingsOpen] = React.useState(false);
  const [taxSettings, setTaxSettings] = React.useState<TaxSettings>({
    filingStatus: 'single',
    churchTaxRate: 0,
    cryptoMarginalRate: 0.42, 
  });

  const [yearFilter, setYearFilter] = React.useState<YearFilter>({ kind: 'all', mode: 'holdings' });
  const [isRatesOpen, setIsRatesOpen] = React.useState(false);
  const [ratesInv, setRatesInv] = React.useState<Investment | null>(null);
  
  const [section, setSection] = React.useState<"summary" | "investments">("summary");
  const summaryRef = React.useRef<PortfolioSummaryHandle>(null);
  const [pendingOpenEstimate, setPendingOpenEstimate] = React.useState(false);
  const isMobile = useIsMobile();

  const krakenSummary = useKrakenYearlySummary(
    user?.uid ?? undefined,
    yearFilter.kind === 'year' ? yearFilter.year : yearFilter.kind === 'all' ? null : new Date().getFullYear()
  );

  const [fifoWarnSymbol, setFifoWarnSymbol] = React.useState<string | null>(null);
  const [isFifoDialogOpen, setIsFifoDialogOpen] = React.useState(false);
  const [fifoSellSymbol, setFifoSellSymbol] = React.useState<string | null>(null);

  const setYearFilterHoldingsSafe = React.useCallback((next: YearFilter) => {
    setYearFilter(next.kind === 'year' 
      ? { kind: 'year', year: next.year, mode: next.mode ?? 'holdings' }
      : { kind: 'all', mode: next.mode ?? 'holdings' }
    );
  }, []);

  const fetchAllData = React.useCallback(async (userId: string) => {
    try {
      const parseYear = (y: unknown): number | null => {
        const n = typeof y === "number" ? y : parseInt(String(y), 10);
        if (Number.isNaN(n)) return null;
        if (n < 1900 || n > 3000) return null;
        return n;
      };

      const [userInvestments, etfSums, years, settings] = await Promise.all([
        getInvestments(userId),
        getAllEtfSummaries(userId),
        getSellYears(userId),
        getTaxSettings(userId),
      ]);
      
      const rateSchedules = await getAllRateSchedules(userId, userInvestments);
      
      setInvestments(userInvestments);
      setEtfSummaries(etfSums);
      setRateSchedulesMap(rateSchedules);

      const yearSet = new Set<number>();
      for (const y of years ?? []) {
        const n = parseYear(y);
        if (n != null) yearSet.add(n);
      }

      for (const s of etfSums) {
        const byYear = (s as any).byYear;
        if (!byYear) continue;

        if (Array.isArray(byYear)) {
          for (const row of byYear) {
            const n = parseYear(row?.year);
            if (n != null) yearSet.add(n);
          }
        } else {
          for (const key of Object.keys(byYear)) {
            const n = parseYear(key);
            if (n != null) yearSet.add(n);
          }
        }
      }
      
      yearSet.add(new Date().getFullYear());
      const unifiedYears = Array.from(yearSet).sort((a,b) => b - a);
      setSellYears(unifiedYears);
      
      if (settings) {
        setTaxSettings(settings);
      }

      if (userInvestments.length > 0) {
        const txMap = await getAllTransactionsForInvestments(userId, userInvestments);
        setTransactionsMap(txMap);
      } else {
        setTransactionsMap({});
      }
    } catch(error) {
       console.error("Error fetching page data:", error);
       toast({ title: "Error", description: "Could not fetch portfolio data.", variant: "destructive" });
    } finally {
      setInitialLoading(false);
    }
  }, [toast]);


  React.useEffect(() => {
    if (user) {
      fetchAllData(user.uid);
    }
  }, [user, fetchAllData]);

  const handleAutoRefreshComplete = React.useCallback(() => {
    if (user?.uid) fetchAllData(user.uid);
  }, [user?.uid, fetchAllData]);

  useAutoRefreshPrices({
    userId: user?.uid,
    investments,
    onComplete: handleAutoRefreshComplete
  });


  const handleRefreshPrices = async () => {
    if (!user || isRefreshing) return;

    setIsRefreshing(true);
    toast({ title: 'Refreshing Prices...', description: 'Please wait while we fetch the latest data.' });

    const result = await refreshInvestmentPrices({ userId: user.uid, forced: true });

    if (result.skippedReason === 'rate_limited') {
        toast({
            title: 'Recently refreshed',
            description: result.nextAllowedAt
                ? `Try again after ${new Date(result.nextAllowedAt).toLocaleString()}`
                : 'Please try again later.',
        });
        setIsRefreshing(false);
        return;
    }

    if (result.success) {
      await fetchAllData(user.uid);
    }

    toast({
        title: result.success ? "Update Complete" : "Update Failed",
        description: result.message,
        variant: result.success ? "default" : "destructive",
        duration: (result.failedInvestmentNames?.length ?? 0) > 0 ? 10000 : 5000,
    });

    setIsRefreshing(false);
}

  const investmentsYearScoped = React.useMemo(() => {
    if (yearFilter.kind === 'all') {
      return investments;
    }
  
    const y = yearFilter.year;
    return investments.filter(inv => {
      const purchasedInOrBefore = new Date(inv.purchaseDate).getFullYear() <= y;
      if (!purchasedInOrBefore) return false;

      const soldTxs = (transactionsMap[inv.id] ?? []).filter(tx => tx.type === 'Sell');
      const firstSellInOrAfter = soldTxs.length > 0 && new Date(soldTxs[0].date).getFullYear() >= y;

      return inv.status === 'Active' || firstSellInOrAfter;
    });
  }, [investments, transactionsMap, yearFilter]);

  const typeCounts = React.useMemo(() => {
    const base = investmentsYearScoped.filter(inv =>
      isTaxView
        ? inv.status === 'Sold'
        : (statusFilter === 'All' ? true : inv.status === statusFilter)
    );
  
    const counts: Record<InvestmentType | 'All', number> = {
      All: 0,
      Stock: 0,
      Crypto: 0,
      ETF: 0,
      'Interest Account': 0,
      Bond: 0,
      'Real Estate': 0,
      Future: 0,
    };
  
    base.forEach(inv => {
      counts.All++;
      counts[inv.type] = (counts[inv.type] ?? 0) + 1;
    });
  
    return counts;
  }, [investmentsYearScoped, isTaxView, statusFilter]);

  const investmentNameOptions = React.useMemo(() => {
    let base = investmentsYearScoped.filter(inv =>
      isTaxView
        ? inv.status === 'Sold'
        : (statusFilter === 'All' ? true : inv.status === statusFilter)
    );
    if (typeFilter !== 'All' && typeFilter !== 'Futures') {
      base = base.filter(inv => inv.type === typeFilter);
    }
    const names = Array.from(new Set(base.map(inv => inv.name).filter(Boolean as unknown as (x: string | null | undefined) => x is string)));
    names.sort((a, b) => a.localeCompare(b));
    return names;
  }, [investmentsYearScoped, isTaxView, statusFilter, typeFilter]);

  React.useEffect(() => {
    if (investmentNameFilter !== 'All' && !investmentNameOptions.includes(investmentNameFilter)) {
      setInvestmentNameFilter('All');
    }
  }, [investmentNameOptions, investmentNameFilter]);


  const filteredAndSortedInvestments = React.useMemo(() => {
    let filtered = [...investmentsYearScoped];

    if (typeFilter !== 'All' && typeFilter !== 'Futures') {
      filtered = filtered.filter(inv => inv.type === typeFilter);
    }
    
    if (isTaxView) {
      filtered = filtered.filter(inv => inv.status === 'Sold');
    } else if (statusFilter !== 'All') {
      filtered = filtered.filter(inv => inv.status === statusFilter);
    }

    if (investmentNameFilter !== 'All') {
      filtered = filtered.filter(inv => inv.name === investmentNameFilter);
    }

    return filtered.sort((a, b) => {
      switch (sortKey) {
        case 'performance':
          return performancePct(b) - performancePct(a);
        case 'totalAmount': {
          const availableA = a.purchaseQuantity - (a.totalSoldQty ?? 0);
          const availableB = b.purchaseQuantity - (b.totalSoldQty ?? 0);
          const totalA = (a.currentValue ?? 0) * availableA;
          const totalB = (b.currentValue ?? 0) * availableB;
          return totalB - totalA;
        }
        case 'purchaseDate':
        default: {
          const dateA = a.purchaseDate ? new Date(a.purchaseDate).getTime() : 0;
          const dateB = b.purchaseDate ? new Date(b.purchaseDate).getTime() : 0;
          return dateB - dateA;
        }
      }
    });
  }, [investmentsYearScoped, typeFilter, statusFilter, sortKey, isTaxView, investmentNameFilter]);

  const investmentMetrics = React.useMemo(() => {
    const metricsMap = new Map<string, ReturnType<typeof calculatePositionMetrics>>();
    filteredAndSortedInvestments.forEach(inv => {
        const metrics = calculatePositionMetrics(
            inv, 
            transactionsMap[inv.id] ?? [], 
            yearFilter, 
            rateSchedulesMap[inv.id]
        );
        metricsMap.set(inv.id, metrics);
    });
    return metricsMap;
  }, [filteredAndSortedInvestments, transactionsMap, yearFilter, rateSchedulesMap]);

  // Futures: load positions (mock data to avoid Firestore issues) and derive live metrics
  const { positions: futuresPositions } = useFuturesPositions({ userId: user?.uid, useMockData: false });
  const { positions: closedPositions } = useClosedPositions(user?.uid);

  // Calculate realized P&L from closed positions (sum of all netRealizedPnlEur)
  const closedPositionsRealizedPL = React.useMemo(() => {
    if (!closedPositions || closedPositions.length === 0) return 0;
    
    return closedPositions.reduce((total, pos) => {
      // Filter by year if needed
      if (yearFilter.kind === 'year' && pos.closedAt) {
        let closedDate: Date;
        if (typeof pos.closedAt === 'object' && 'toDate' in pos.closedAt) {
          closedDate = pos.closedAt.toDate();
        } else {
          closedDate = new Date(pos.closedAt as any);
        }
        const closedYear = closedDate.getFullYear();
        if (closedYear !== yearFilter.year) return total;
      }
      
      const netPnl = Number(pos.netRealizedPnlEur || 0);
      return total + netPnl;
    }, 0);
  }, [closedPositions, yearFilter]);

  // Store live market prices for open futures positions
  const [futuresLiveData, setFuturesLiveData] = React.useState<{
    unrealizedPnLSum: number;
    totalNotionalEur: number;
    totalEntryValueEur: number;
    hasOpenPositions: boolean;
  }>({
    unrealizedPnLSum: 0,
    totalNotionalEur: 0,
    totalEntryValueEur: 0,
    hasOpenPositions: false,
  });

  // Fetch live prices for open futures positions
  React.useEffect(() => {
    let intervalId: NodeJS.Timeout;

    const updatePrices = async () => {
      if (!futuresPositions || futuresPositions.length === 0) {
        setFuturesLiveData({
          unrealizedPnLSum: 0,
          totalNotionalEur: 0,
          totalEntryValueEur: 0,
          hasOpenPositions: false,
        });
        return;
      }

      let uPnL = 0;
      let totalNotional = 0;
      let totalEntryValue = 0;
      let hasOpen = false;

      for (const pos of futuresPositions) {
        if (pos.status?.trim().toUpperCase() !== 'OPEN') continue;
        
        hasOpen = true;
        const cleanAsset = pos.asset.split('/')[0].split(' ')[0].split('-')[0].toUpperCase();

        try {
          const res = await fetch(`/api/kraken/prices?asset=${cleanAsset}`);
          const data = await res.json();
          const markPrice = Number(data.price);

          if (markPrice > 0) {
            const entryPrice = Number(pos.entryPrice || 0);
            const qty = Number(pos.size || 0);
            const rate = Number(pos.exchangeRate || 1);

            // 1. Cost Basis (Entry Notional en EUR)
            const costBasis = qty * entryPrice * rate;

            // 2. P&L Real para SHORT y LONG
            const diffUsd = pos.side === 'SHORT' 
              ? (entryPrice - markPrice) * qty 
              : (markPrice - entryPrice) * qty;
            const unrealized = diffUsd * rate;

            // 3. Market Value (Nocional Actual en EUR)
            const marketValue = qty * markPrice * rate;

            totalNotional += marketValue;
            totalEntryValue += costBasis;
            uPnL += unrealized;
          }
        } catch (error) {
          console.error(`Error fetching price for ${cleanAsset}:`, error);
        }
      }

      setFuturesLiveData({
        unrealizedPnLSum: uPnL,
        totalNotionalEur: totalNotional,
        totalEntryValueEur: totalEntryValue,
        hasOpenPositions: hasOpen,
      });
    };

    updatePrices();
    intervalId = setInterval(updatePrices, 10000);

    return () => clearInterval(intervalId);
  }, [futuresPositions]);
  
  const summaryData = React.useMemo(() => {
    return aggregateByType(
      investments,
      transactionsMap,
      etfSummaries,
      yearFilter,
      isTaxView ? taxSettings : null,
      rateSchedulesMap,
      krakenSummary,
      futuresLiveData.unrealizedPnLSum,
      futuresLiveData.totalNotionalEur,
      futuresLiveData.totalEntryValueEur,
      futuresLiveData.hasOpenPositions,
      closedPositionsRealizedPL,
    );
  }, [
    investments,
    transactionsMap,
    etfSummaries,
    yearFilter,
    isTaxView,
    taxSettings,
    rateSchedulesMap,
    krakenSummary,
    futuresLiveData.unrealizedPnLSum,
    futuresLiveData.totalNotionalEur,
    futuresLiveData.totalEntryValueEur,
    futuresLiveData.hasOpenPositions,
    closedPositionsRealizedPL,
  ]);


  const handleAddClick = (prefill?: InvestmentType) => {
    setEditingInvestment(undefined);
    setPrefillType(prefill);
    setIsFormOpen(true);
  };

  const handleEditClick = (investment: Investment) => {
    setTimeout(() => {
      setEditingInvestment(investment);
      setIsFormOpen(true);
    }, 150);
  };

  const handleHistoryClick = (investment: Investment) => {
    setTimeout(() => {
      setViewingHistoryInvestment(investment);
      setHistoryDialogView('list');
      setIsHistoryOpen(true);
    }, 150);
  }

  const handleAddTransactionClick = (investment: Investment) => {
    if (investment.type !== 'Interest Account' && investment.ticker && investment.status === 'Active') {
        const investmentDate = new Date(investment.purchaseDate).getTime();
        
        const olderLotExists = investments.some(other => 
            other.id !== investment.id && 
            other.ticker === investment.ticker &&
            other.status === 'Active' &&
            other.exchange === investment.exchange &&
            new Date(other.purchaseDate).getTime() < investmentDate
        );

        if (olderLotExists) {
            setFifoWarnSymbol(investment.ticker);
            return;
        }
    }
    setTimeout(() => {
      setViewingHistoryInvestment(investment);
      setHistoryDialogView('form');
      setIsHistoryOpen(true);
    }, 150);
  };
  
  const handleDeleteClick = (id: string) => {
    setTimeout(() => {
      setDeletingInvestmentId(id);
      setIsDeleteDialogOpen(true);
    }, 150);
  }

  const confirmDelete = async () => {
    if (deletingInvestmentId && user) {
      await deleteInvestment(user.uid, deletingInvestmentId);
      
      setIsDeleteDialogOpen(false);

      setTimeout(() => {
        setInvestments(prev => prev.filter(inv => inv.id !== deletingInvestmentId));
        setDeletingInvestmentId(null);
        toast({ title: "Success", description: "Investment deleted successfully." });
      }, 300); 
    } else {
        setIsDeleteDialogOpen(false);
        setDeletingInvestmentId(null);
    }
  }


  const handleFormSubmit = async (
    values: InvestmentFormValues,
    startingBalance?: number,
    initialRatePct?: number
  ) => {
    if (!user) return;
    
    const isEditing = !!editingInvestment;
    try {
        if (isEditing && editingInvestment) {
          await updateInvestment(user.uid, editingInvestment.id, values);
          
          setIsFormOpen(false);

          setTimeout(() => {
            setInvestments(prev => prev.map(inv => 
               inv.id === editingInvestment.id ? { ...inv, ...values, purchaseDate: values.purchaseDate.toISOString() } : inv
            ));
            setEditingInvestment(undefined);
            toast({
                title: "Success",
                description: "Investment updated successfully.",
            });
          }, 300);

        } else {
          const invId = await addInvestment(user.uid, values, initialRatePct);
          
          if (values.type === 'Interest Account' && startingBalance && startingBalance > 0) {
              await addTransaction(user.uid, invId, {
                  type: 'Deposit',
                  date: values.purchaseDate,
                  amount: startingBalance,
                  quantity: 0,
                  pricePerUnit: 0,
              });
          }
          
          setIsFormOpen(false);

          setTimeout(async () => {
            await fetchAllData(user.uid);
            setEditingInvestment(undefined);
             toast({
                title: "Success",
                description: "Investment added successfully.",
            });
          }, 300);
        }
        
    } catch (error) {
        toast({
            title: "Error",
            description: `There was a problem ${isEditing ? 'updating' : 'adding'} the investment.`,
            variant: "destructive"
        });
        console.error("Form submission error:", error);
    }
  };

  const onTransactionAdded = async () => {
    setTimeout(async () => {
        if(user) {
            await fetchAllData(user.uid);
        }
    }, 300); 
  }

  const handleSaveTaxSettings = async (newSettings: TaxSettings) => {
    if (!user) return;
    try {
        await updateTaxSettings(user.uid, newSettings);
        setTaxSettings(newSettings);
        setIsTaxSettingsOpen(false);
        toast({ title: "Success", description: "Tax settings saved." });
    } catch (error) {
        toast({ title: "Error", description: "Could not save tax settings.", variant: "destructive" });
        console.error("Failed to save tax settings:", error);
    }
  };

  const handleManageRates = (inv: Investment) => {
    setTimeout(() => {
      setRatesInv(inv);
      setIsRatesOpen(true);
    }, 150);
  };
  
  const canToggleTaxReport = yearFilter.kind === 'year' && (isMobile ? viewMode === 'grid' : true);
  
  const ensureTaxPreconditions = React.useCallback(() => {
    const defaultYear = sellYears[0] ?? new Date().getFullYear();

    if (yearFilter.kind !== 'year') {
      setYearFilter({ kind: 'year', year: defaultYear, mode: yearFilter.mode });
    }
    if (isMobile && viewMode !== 'grid') {
      setViewMode('grid');
    }
  }, [sellYears, yearFilter, isMobile, viewMode, setYearFilter, setViewMode]);

  const handleOpenTaxEstimate = React.useCallback(() => {
    ensureTaxPreconditions();
    setIsTaxView(true);
    setSection("summary");
    setTimeout(() => summaryRef.current?.openEstimate(), 0);
  }, [ensureTaxPreconditions]);

  const handleToggleTaxView = React.useCallback(() => {
    const next = !isTaxView;
    if (next) {
      ensureTaxPreconditions();
    }
    setIsTaxView(next);
  }, [isTaxView, ensureTaxPreconditions]);


  React.useEffect(() => {
    if (pendingOpenEstimate && section === "summary" && summaryRef.current) {
      summaryRef.current.openEstimate();
      setPendingOpenEstimate(false);
    }
  }, [pendingOpenEstimate, section]);

  const selectedYear = yearFilter.kind === 'year' ? yearFilter.year : null;
  const toggleDisabledReason =
    selectedYear == null
      ? 'Select a year to build the German Tax Report.'
      : viewMode !== 'grid' && isMobile
      ? 'Switch to Cards view to see per-asset estimates.'
      : undefined;
      
  const canOpenEstimate = selectedYear != null && isTaxView;
  const estimateDisabledReason =
    selectedYear == null
      ? 'Select a year to view the estimate.'
      : !isTaxView
      ? 'Turn on German Tax Report to view the estimate.'
      : undefined;

  // Force List view when Futures is selected
  React.useEffect(() => {
    if (typeFilter === 'Futures') {
      setViewMode('list');
    }
  }, [typeFilter]);

  const isFuturesView = typeFilter === 'Futures';
  const [futuresStatusFilter, setFuturesStatusFilter] = React.useState<'All' | 'OPEN' | 'CLOSED' | 'LIQUIDATED'>('All');

  const setModeSafely = (mode: 'grid' | 'list') => {
    if (isTaxView && mode === 'list') {
      toast({
        title: 'German Tax Report',
        description: 'Turn off German Tax Report to use List view.',
      });
      return;
    }
    if (isFuturesView && mode === 'grid') {
      toast({
        title: 'Futures View',
        description: 'Futures trades require List view to display the table properly.',
      });
      return;
    }
    setViewMode(mode);
  };

  const handleConfirmFifo = () => {
    if (fifoWarnSymbol) {
        setFifoSellSymbol(fifoWarnSymbol);
        setFifoWarnSymbol(null);
        setIsFifoDialogOpen(true);
    }
  };

  const getExchangesForSymbol = (sym: string | null) => {
    if (!sym) return [];
    const relevant = investments.filter(i => i.ticker === sym && i.status === 'Active');
    
    // Include "Unassigned" if there are investments without an exchange
    const hasUnassigned = relevant.some(i => !i.exchange);
    
    const exchanges = new Set(relevant.map(i => i.exchange).filter(Boolean) as string[]);
    
    const result = Array.from(exchanges).sort();
    if (hasUnassigned) {
      result.push("Unassigned"); 
    }
    return result;
  };

  const advancedFilters = (
    <>
      <div className="flex flex-col sm:flex-row items-center gap-4 mt-4">
        <div className="w-full sm:w-auto">
          <Tabs value={typeFilter} onValueChange={(value) => setTypeFilter(value as TypeFilterValue)}>
            <TabsList className="h-auto overflow-x-auto whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <TabsTrigger value="All">All Types ({typeCounts.All})</TabsTrigger>
              <TabsTrigger value="Stock">Stocks ({typeCounts.Stock})</TabsTrigger>
              <TabsTrigger value="Crypto">Crypto ({typeCounts.Crypto})</TabsTrigger>
              <TabsTrigger value="ETF">ETFs ({typeCounts.ETF})</TabsTrigger>
              <TabsTrigger value="Interest Account">Interest Accounts ({typeCounts['Interest Account']})</TabsTrigger>
              <TabsTrigger value="Bond">Bonds ({typeCounts.Bond})</TabsTrigger>
              <TabsTrigger value="Real Estate">Real Estate ({typeCounts['Real Estate']})</TabsTrigger>
              <TabsTrigger value="Futures">Futures</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="flex-grow" />
        {!isFuturesView ? (
          // General filters for investments
          <div className="flex items-center gap-3 w-full sm:w-auto min-w-0">
            <div className="w-full sm:w-[220px]">
              <Select
                value={investmentNameFilter}
                onValueChange={(v) => setInvestmentNameFilter(v as 'All' | string)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Filter by investment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Investments</SelectItem>
                  {investmentNameOptions.map((n) => (
                    <SelectItem key={n} value={n}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="w-full sm:w-[180px]">
                      <Select 
                          value={isTaxView ? 'Sold' : statusFilter}
                          onValueChange={(value) => setStatusFilter(value as InvestmentStatus | 'All')}
                          disabled={isTaxView}
                      >
                      <SelectTrigger>
                          <SelectValue placeholder="Filter by status" />
                      </SelectTrigger>
                      <SelectContent>
                          <SelectItem value="All">All Statuses</SelectItem>
                          <SelectItem value="Active">Active</SelectItem>
                          <SelectItem value="Sold">Sold</SelectItem>
                      </SelectContent>
                      </Select>
                  </div>
                </TooltipTrigger>
                {isTaxView && (
                  <TooltipContent>
                    <p>Status is locked to &quot;Sold&quot; in Tax Report view.</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
            <Select value={sortKey} onValueChange={(value) => setSortKey(value as SortKey)}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="purchaseDate">Sort by Date</SelectItem>
                <SelectItem value="performance">Sort by Performance</SelectItem>
                <SelectItem value="totalAmount">Sort by Total Amount</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : (
          // Futures-specific filter
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Select value={futuresStatusFilter} onValueChange={(value) => setFuturesStatusFilter(value as 'All' | 'OPEN' | 'CLOSED' | 'LIQUIDATED')}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Statuses</SelectItem>
                <SelectItem value="OPEN">Open</SelectItem>
                <SelectItem value="CLOSED">Closed</SelectItem>
                <SelectItem value="LIQUIDATED">Liquidated</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </>
  );

  const investmentsView = (
    <>
      <MobileFilters view={viewMode} setView={setViewMode} mode={listMode} setMode={setListMode} isFuturesView={isFuturesView}>
        <div className="mt-2 -mx-4 px-4">
         {advancedFilters}
        </div>
      </MobileFilters>
      
      <div className="mt-2 hidden md:block -mx-4 px-4">
        {advancedFilters}
      </div>

      {initialLoading ? (
          <div className="flex justify-center items-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : viewMode === 'list' ? (
            typeFilter === 'Futures' ? (
              <div className="space-y-6">
                <KrakenTaxSummaryCards userId={user?.uid ?? null} year={new Date().getFullYear()} />
                <Card>
                  <CardContent>
                    <FuturesPositionsTable useMockData={!user} userId={user?.uid ?? null} statusFilter={futuresStatusFilter} />
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card>
                <CardContent>
                  <InvestmentListView
                    investments={filteredAndSortedInvestments}
                    transactionsMap={transactionsMap}
                    rateSchedulesMap={rateSchedulesMap}
                    yearFilter={yearFilter}
                    showTypeColumn={typeFilter === 'All'}
                    mode={listMode}
                    sortKey={sortKey}
                    statusFilter={statusFilter}
                    activeTypeFilter={typeFilter as InvestmentType | 'All'}
                    onViewHistory={(id) => {
                      const inv = investments.find((i) => i.id === id);
                      if (inv) handleHistoryClick(inv);
                    }}
                    onAddTransaction={(id) => {
                      const inv = investments.find((i) => i.id === id);
                      if (inv) handleAddTransactionClick(inv);
                    }}
                  />
                </CardContent>
              </Card>
            )
          ) : filteredAndSortedInvestments.length > 0 ? (
          <div className="space-y-4">
            {filteredAndSortedInvestments.map(investment => {
              const metrics = investmentMetrics.get(investment.id);
              const txs = transactionsMap[investment.id] ?? [];
              const lastSoldOn = txs
                .filter(t => t.type === 'Sell')
                .sort((a, b) => a.date.localeCompare(b.date))
                .at(-1)?.date ?? null;

              return (
                <InvestmentCard 
                  key={investment.id} 
                  investment={investment} 
                  metrics={metrics}
                  isTaxView={isTaxView}
                  onEdit={() => handleEditClick(investment)}
                  onDelete={() => handleDeleteClick(investment.id)}
                  onViewHistory={() => handleHistoryClick(investment)}
                  onAddTransaction={() => handleAddTransactionClick(investment)}
                  taxSettings={taxSettings}
                  realizedPLYear={metrics?.realizedPLYear ?? 0}
                  dividendsYear={metrics?.dividendsYear ?? 0}
                  interestYear={metrics?.interestYear ?? 0}
                  currentRatePct={getCurrentRate(rateSchedulesMap[investment.id])}
                  onManageRates={() => handleManageRates(investment)}
                  taxSummary={summaryData.taxSummary}
                  soldOn={lastSoldOn}
                />
              )
            })}
          </div>
        ) : (
          <div className="text-center py-16">
            <h3 className="text-xl font-semibold text-foreground">No Investments Found</h3>
            <p className="text-muted-foreground mt-2">
               {isTaxView ? "No sold positions match the current filters." : "Add a new investment to get started."}
            </p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <Button onClick={() => handleAddClick(typeFilter !== 'All' && typeFilter !== 'Futures' ? typeFilter : undefined)}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Add First Investment
              </Button>
             {typeFilter === 'ETF' && <EtfPlansButton />}
            </div>
          </div>
        )}
         <button
          onClick={() => handleAddClick(typeFilter !== 'All' && typeFilter !== 'Futures' ? typeFilter : undefined)}
          className="md:hidden fixed right-4 z-50 rounded-full bg-primary text-primary-foreground shadow-lg px-5 py-3 font-medium"
          style={{ bottom: "calc(72px + env(safe-area-inset-bottom) + 8px)" }}
        >
          Add Investment
        </button>
    </>
  );

  React.useEffect(() => {
    if (!canToggleTaxReport && isTaxView) {
      setIsTaxView(false);
    }
  }, [canToggleTaxReport, isTaxView]);

  if (isMobile === undefined) {
    return <div className="h-screen w-full bg-background" />;
  }

  const mobileView = (
      <MobileAppShell
        section={section}
        onSectionChange={setSection}
        onTaxSettingsClick={() => setIsTaxSettingsOpen(true)}
        onViewTaxEstimate={handleOpenTaxEstimate}
        isTaxView={isTaxView}
        onToggleTaxView={handleToggleTaxView}
      >
        <div className="mx-auto w-full px-4 sm:px-6 overflow-x-hidden">
          {section === "summary" ? (
            <PortfolioSummary 
              ref={summaryRef}
              summaryData={summaryData}
              sellYears={sellYears} 
              isTaxView={isTaxView}
              taxSettings={taxSettings}
              yearFilter={yearFilter}
              onYearFilterChange={setYearFilterHoldingsSafe}
            />
          ) : (
            investmentsView
          )}
        </div>
      </MobileAppShell>
  );

  const desktopView = (
      <div className="min-h-[100svh] w-full bg-background overflow-x-hidden">
        <DashboardHeader 
            isTaxView={isTaxView} 
            onTaxViewChange={setIsTaxView}
            onTaxSettingsClick={() => setIsTaxSettingsOpen(true)}
            canToggleTaxReport={canToggleTaxReport}
            selectedYear={selectedYear}
            onViewTaxEstimate={() => summaryRef.current?.openEstimate()}
            toggleDisabledReason={toggleDisabledReason}
            canOpenEstimate={canOpenEstimate}
            estimateDisabledReason={estimateDisabledReason}
        />
        <main className="p-4 sm:p-6 lg:p-8">
          <PortfolioSummary 
            ref={summaryRef}
            summaryData={summaryData}
            sellYears={sellYears} 
            isTaxView={isTaxView}
            taxSettings={taxSettings}
            yearFilter={yearFilter}
            onYearFilterChange={setYearFilterHoldingsSafe}
          />
          <div className="mt-8 mb-8 p-4 bg-card/50 rounded-lg shadow-sm">
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-5 w-5 text-muted-foreground"/>
                <h2 className="text-lg font-semibold">Filters &amp; Sorting</h2>
              </div>
              <div className="flex items-center gap-2 ml-4">
                <div className="rounded-md border p-1">
                  <button
                    className={`px-3 py-1 rounded ${viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'} ${isFuturesView ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={() => setModeSafely('grid')}
                    disabled={isFuturesView}
                    aria-disabled={isFuturesView}
                  >
                    Cards
                  </button>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <button
                            className={`px-3 py-1 rounded ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                            onClick={() => setModeSafely('list')}
                            disabled={isTaxView}
                            aria-disabled={isTaxView}
                          >
                            List
                          </button>
                        </span>
                      </TooltipTrigger>
                      {isTaxView && (
                        <TooltipContent>Turn off German Tax Report to use List view.</TooltipContent>
                      )}
                      {isFuturesView && (
                        <TooltipContent>Futures trades require List view (already active).</TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                </div>

                {viewMode === 'list' && !isFuturesView && (
                  <div className="rounded-md border p-1">
                    <button
                      className={`px-3 py-1 rounded ${listMode === 'aggregated' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                      onClick={() => setListMode('aggregated')}
                    >
                      Aggregated
                    </button>
                    <button
                      className={`px-3 py-1 rounded ${listMode === 'flat' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                      onClick={() => setListMode('flat')}
                    >
                      Flat
                    </button>
                  </div>
                )}
              </div>
              <div className="flex-grow" />
              <div className="flex items-center gap-4 w-full sm:w-auto">
                 <Button onClick={handleRefreshPrices} disabled={isRefreshing}>
                  {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Refresh Prices
                </Button>
                <EtfPlansButton />
                 <Button onClick={() => handleAddClick(typeFilter !== 'All' && typeFilter !== 'Futures' ? typeFilter : undefined)}>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Add Investment
                </Button>
              </div>
            </div>
            {advancedFilters}
          </div>
          
          {initialLoading ? (
             <div className="flex justify-center items-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : viewMode === 'list' ? (
              typeFilter === 'Futures' ? (
                <Card>
                  <CardContent>
                    <FuturesPositionsTable useMockData={!user} userId={user?.uid ?? ""} statusFilter={futuresStatusFilter} />
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent>
                    <InvestmentListView
                      investments={filteredAndSortedInvestments}
                      transactionsMap={transactionsMap}
                      rateSchedulesMap={rateSchedulesMap}
                      yearFilter={yearFilter}
                      showTypeColumn={typeFilter === 'All'}
                      mode={listMode}
                      sortKey={sortKey}
                      statusFilter={statusFilter}
                      activeTypeFilter={typeFilter as InvestmentType | 'All'}
                      onViewHistory={(id) => {
                        const inv = investments.find((i) => i.id === id);
                        if (inv) handleHistoryClick(inv);
                      }}
                      onAddTransaction={(id) => {
                        const inv = investments.find((i) => i.id === id);
                        if (inv) handleAddTransactionClick(inv);
                      }}
                    />
                  </CardContent>
                </Card>
              )
            ) : filteredAndSortedInvestments.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6">
              {filteredAndSortedInvestments.map(investment => {
                const metrics = investmentMetrics.get(investment.id);
                const txs = transactionsMap[investment.id] ?? [];
                const lastSoldOn = txs
                  .filter(t => t.type === 'Sell')
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .at(-1)?.date ?? null;

                return (
                  <InvestmentCard 
                    key={investment.id} 
                    investment={investment} 
                    metrics={metrics}
                    isTaxView={isTaxView}
                    onEdit={() => handleEditClick(investment)}
                    onDelete={() => handleDeleteClick(investment.id)}
                    onViewHistory={() => handleHistoryClick(investment)}
                    onAddTransaction={() => handleAddTransactionClick(investment)}
                    taxSettings={taxSettings}
                    realizedPLYear={metrics?.realizedPLYear ?? 0}
                    dividendsYear={metrics?.dividendsYear ?? 0}
                    interestYear={metrics?.interestYear ?? 0}
                    currentRatePct={getCurrentRate(rateSchedulesMap[investment.id])}
                    onManageRates={() => handleManageRates(investment)}
                    taxSummary={summaryData.taxSummary}
                    soldOn={lastSoldOn}
                  />
                )
              })}
            </div>
          ) : (
            <div className="text-center py-16">
              <h3 className="text-xl font-semibold text-foreground">No Investments Found</h3>
              <p className="text-muted-foreground mt-2">
                 {isTaxView ? "No sold positions match the current filters." : "Add a new investment to get started."}
              </p>
              <div className="mt-4 flex items-center justify-center gap-3">
                <Button onClick={() => handleAddClick(typeFilter !== 'All' && typeFilter !== 'Futures' ? typeFilter : undefined)}>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Add First Investment
                </Button>
               {typeFilter === 'ETF' && <EtfPlansButton />}
              </div>
            </div>
          )}
        </main>
      </div>
  );

  return (
    <>
      {isMobile ? mobileView : desktopView}
      
      <InvestmentForm 
        isOpen={isFormOpen}
        onOpenChange={setIsFormOpen}
        onSubmit={handleFormSubmit}
        investment={editingInvestment}
        initialType={prefillType}
      />
      <TaxSettingsDialog
        isOpen={isTaxSettingsOpen}
        onOpenChange={setIsTaxSettingsOpen}
        currentSettings={taxSettings}
        onSave={handleSaveTaxSettings}
      />
       <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent 
            onCloseAutoFocus={(e) => {
                e.preventDefault();
                document.body.focus();
            }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete this investment?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently remove the investment data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* --- NEW: FIFO Warning Alert --- */}
      <AlertDialog open={!!fifoWarnSymbol} onOpenChange={(open) => !open && setFifoWarnSymbol(null)}>
        <AlertDialogContent onCloseAutoFocus={(e) => e.preventDefault()}>
            <AlertDialogHeader>
                <AlertDialogTitle>FIFO Rule Applies</AlertDialogTitle>
                <AlertDialogDescription>
                    In Germany, securities are sold on a First-In, First-Out (FIFO) basis. 
                    To maintain accurate tax calculations, this sale will be applied to your 
                    oldest <b>{fifoWarnSymbol}</b> holdings first.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleConfirmFifo}>
                    Proceed to Sell
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* --- NEW: FIFO Sell Dialog --- */}
      <FifoSellDialog 
        isOpen={isFifoDialogOpen}
        onOpenChange={setIsFifoDialogOpen}
        symbol={fifoSellSymbol}
        availableExchanges={getExchangesForSymbol(fifoSellSymbol)}
        onSuccess={async () => {
             if (user) await fetchAllData(user.uid);
        }}
      />

      {viewingHistoryInvestment && (
        <TransactionHistoryDialog 
            isOpen={isHistoryOpen}
            onOpenChange={setIsHistoryOpen}
            investment={viewingHistoryInvestment}
            onTransactionAdded={onTransactionAdded}
            initialView={historyDialogView}
        />
      )}
      {ratesInv && (
        <RateScheduleDialog
          isOpen={isRatesOpen}
          onOpenChange={setIsRatesOpen}
          investment={ratesInv}
          rates={rateSchedulesMap[ratesInv.id]}
          onChanged={async () => { if (user) await fetchAllData(user.uid); }}
        />
      )}
    </>
  );
}

export default function DashboardPage() {
  return (
    <React.Suspense fallback={<div className="h-screen w-full bg-background" />}>
      <DashboardPageContent />
    </React.Suspense>
  );
}

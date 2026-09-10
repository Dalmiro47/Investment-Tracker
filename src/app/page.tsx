
"use client";

import React from 'react';
import { useFuturesPositions } from '@/hooks/useFuturesPositions';
import { useClosedPositions } from '@/hooks/useClosedPositions';
import { useKrakenYearlySummary } from '@/hooks/useKrakenYearlySummary';
import type { Investment, InvestmentType, InvestmentStatus, SortKey, InvestmentFormValues, Transaction, YearFilter, TaxSettings } from '@/lib/types';
import { addInvestment, deleteInvestment, getInvestments, updateInvestment, getAllTransactionsForInvestments, deriveSellYears, getTaxSettings, updateTaxSettings, getAllRateSchedules, addTransaction } from '@/lib/firestore';
import { refreshInvestmentPrices } from './actions';
import DashboardHeader from '@/components/dashboard-header';
import InvestmentCard from '@/components/investment-card';
import PortfolioSummary, { type PortfolioSummaryHandle } from '@/components/portfolio-summary';
import { InvestmentForm } from '@/components/investment-form';
import { TaxSettingsDialog } from '@/components/tax-settings-dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2, RefreshCw, Search, LayoutGrid, List, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Card, CardContent } from '@/components/ui/card';
import { MobileAppShell } from '@/components/shell/MobileAppShell';
import { MobileFilters } from '@/components/filters/MobileFilters';
import { useIsMobile } from '@/hooks/use-mobile';
import { type MobileAppliedFilters, MOBILE_DEFAULTS } from '@/lib/mobile';
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
      // Wave 1: the two reads that don't depend on anything else.
      const [userInvestments, settings] = await Promise.all([
        getInvestments(userId),
        getTaxSettings(userId),
      ]);

      setInvestments(userInvestments);
      if (settings) {
        setTaxSettings(settings);
      }

      // Wave 2: everything that needs the investment list, all in parallel.
      // Sell years are derived from the transactions we already fetched
      // instead of re-reading every investment + transaction a second time.
      const [txMap, rateSchedules] = await Promise.all([
        userInvestments.length > 0
          ? getAllTransactionsForInvestments(userId, userInvestments)
          : Promise.resolve<Record<string, Transaction[]>>({}),
        getAllRateSchedules(userId, userInvestments),
      ]);

      setTransactionsMap(txMap);
      setRateSchedulesMap(rateSchedules);
      setSellYears(deriveSellYears(txMap));
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
  const { positions: futuresPositions } = useFuturesPositions({ userId: user?.uid });
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
      let failedFetches = 0;

      for (const pos of futuresPositions) {
        if (pos.status?.trim().toUpperCase() !== 'OPEN') continue;
        
        hasOpen = true;
        if (!pos.asset) continue;
        
        const cleanAsset = pos.asset.split('/')[0].split(' ')[0].split('-')[0].toUpperCase();

        try {
          const res = await fetch(`/api/kraken/prices?asset=${cleanAsset}`, {
            signal: AbortSignal.timeout(5000) // 5 second timeout
          });
          
          if (!res.ok) {
            failedFetches++;
            continue;
          }
          
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
          failedFetches++;
          // Only log if multiple failures occur
          if (failedFetches === 1) {
            console.warn('Unable to fetch some futures prices');
          }
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

  // The estimate dialog needs a per-year tax summary; without one there is nothing to show.
  const canViewTaxEstimate = Boolean(
    isTaxView && yearFilter.kind === 'year' && summaryData?.taxSummary,
  );
  
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
    // The summary (and its ref) only exists on the Dashboard section, so defer
    // opening until it has mounted instead of racing it with a timeout.
    setPendingOpenEstimate(true);
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
  }, [pendingOpenEstimate, section, summaryData]);

  const selectedYear = yearFilter.kind === 'year' ? yearFilter.year : null;
  const toggleDisabledReason =
    selectedYear == null
      ? 'Select a year to build the German Tax Report.'
      : viewMode !== 'grid' && isMobile
      ? 'Switch to Cards view to see per-asset estimates.'
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

  const typePills: { value: TypeFilterValue; label: string; count?: number }[] = [
    { value: 'All', label: 'All', count: typeCounts.All },
    { value: 'Stock', label: 'Stocks', count: typeCounts.Stock },
    { value: 'Crypto', label: 'Crypto', count: typeCounts.Crypto },
    { value: 'ETF', label: 'ETFs', count: typeCounts.ETF },
    { value: 'Interest Account', label: 'Interest', count: typeCounts['Interest Account'] },
    { value: 'Bond', label: 'Bonds', count: typeCounts.Bond },
    { value: 'Real Estate', label: 'Real Estate', count: typeCounts['Real Estate'] },
    { value: 'Futures', label: 'Futures', count: typeCounts.Future },
  ];

  const listDisabledReason = isTaxView
    ? 'Turn off German Tax Report to use List view.'
    : undefined;
  const cardsDisabledReason = isFuturesView
    ? 'Futures trades require List view (already active).'
    : undefined;

  const advancedFilters = (
    // Two rows: the type pill rail gets the full width, the dropdowns sit
    // underneath — sharing a row squeezed the rail under the selects.
    <div className="glass flex flex-col gap-3 p-3 px-3.5">
      {/* Type pill rail */}
      <div
        className="hide-scroll flex w-full gap-1.5 overflow-x-auto"
        role="tablist"
        aria-label="Asset type"
      >
        {typePills.map(({ value, label, count }) => {
          const active = typeFilter === value;
          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTypeFilter(value)}
              className={cn(
                'flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition-colors',
                active
                  ? 'border-primary/45 bg-primary/[.1] text-primary shadow-[0_0_18px_hsl(var(--primary)/.12)]'
                  : 'border-input text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
              {count !== undefined && (
                <span className={cn('font-mono text-[11px] font-medium', active ? 'text-primary/75' : 'text-muted-foreground/70')}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {!isFuturesView ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Select
            value={investmentNameFilter}
            onValueChange={(v) => setInvestmentNameFilter(v as 'All' | string)}
          >
            <SelectTrigger className="w-[190px]">
              <Search size={16} className="shrink-0 text-muted-foreground" />
              <SelectValue placeholder="All investments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Investments</SelectItem>
              {investmentNameOptions.map((n) => (
                <SelectItem key={n} value={n}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="w-[150px]">
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
            <SelectTrigger className="w-[165px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="purchaseDate">Sort: Date</SelectItem>
              <SelectItem value="performance">Sort: Performance</SelectItem>
              <SelectItem value="totalAmount">Sort: Total Amount</SelectItem>
            </SelectContent>
          </Select>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Tabs value={viewMode} onValueChange={(v) => setModeSafely(v as 'grid' | 'list')}>
                    <TabsList>
                      <TabsTrigger value="grid" disabled={isFuturesView} aria-disabled={isFuturesView}>
                        <LayoutGrid size={16} /> Cards
                      </TabsTrigger>
                      <TabsTrigger value="list" disabled={isTaxView} aria-disabled={isTaxView}>
                        <List size={16} /> List
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </span>
              </TooltipTrigger>
              {(listDisabledReason ?? cardsDisabledReason) && (
                <TooltipContent>{listDisabledReason ?? cardsDisabledReason}</TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>

          {viewMode === 'list' && (
            <Tabs value={listMode} onValueChange={(v) => setListMode(v as 'aggregated' | 'flat')}>
              <TabsList>
                <TabsTrigger value="aggregated">Aggregated</TabsTrigger>
                <TabsTrigger value="flat">Flat</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>
      ) : (
        // Futures-specific filter
        <div className="flex items-center gap-2">
          <Select value={futuresStatusFilter} onValueChange={(value) => setFuturesStatusFilter(value as 'All' | 'OPEN' | 'CLOSED' | 'LIQUIDATED')}>
            <SelectTrigger className="w-[165px]">
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
  );

  const emptyState = (
    <div className="glass animate-enter p-4 sm:p-6">
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-input px-6 py-12 text-center sm:py-16">
        <div className="grid h-14 w-14 place-items-center rounded-[16px] border border-primary/20 bg-primary/10 text-primary">
          <Wallet size={24} />
        </div>
        <div className="space-y-1.5">
          <h3 className="font-headline text-[20px] font-bold tracking-tight text-foreground">
            No investments found
          </h3>
          <p className="text-[13px] text-muted-foreground">
            {isTaxView ? 'No sold positions match the current filters.' : 'Add a new investment to get started.'}
          </p>
        </div>
        <Button onClick={() => handleAddClick(typeFilter !== 'All' && typeFilter !== 'Futures' ? typeFilter : undefined)}>
          <Plus size={16} />
          Add first investment
        </Button>
      </div>
    </div>
  );

  const investmentsView = (
    <>
      <MobileFilters
        userId={user?.uid ?? ''}
        initialFilters={{
          typeFilter: typeFilter === 'Future' ? 'Futures' : (typeFilter as MobileAppliedFilters['typeFilter']),
          statusFilter: statusFilter as MobileAppliedFilters['statusFilter'],
          sortKey: sortKey as MobileAppliedFilters['sortKey'],
          viewMode: viewMode as MobileAppliedFilters['viewMode'],
          listMode: listMode as MobileAppliedFilters['listMode'],
          futuresStatusFilter: futuresStatusFilter as MobileAppliedFilters['futuresStatusFilter'],
        }}
        onApply={(applied) => {
          setTypeFilter(applied.typeFilter as TypeFilterValue);
          setStatusFilter(applied.statusFilter as InvestmentStatus | 'All');
          setSortKey(applied.sortKey as SortKey);
          setViewMode(applied.viewMode);
          setListMode(applied.listMode);
          setFuturesStatusFilter(applied.futuresStatusFilter as 'All' | 'OPEN' | 'CLOSED' | 'LIQUIDATED');
        }}
        typeCounts={typeCounts}
        resultCount={filteredAndSortedInvestments.length}
      />

      <div className="mt-3 hidden md:block">
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
                    <React.Suspense fallback={
                      <div className="p-8 text-center text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                        Loading futures data...
                      </div>
                    }>
                      <FuturesPositionsTable userId={user?.uid ?? null} statusFilter={futuresStatusFilter} />
                    </React.Suspense>
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
          <div className="space-y-3">
            {filteredAndSortedInvestments.map((investment, index) => {
              const metrics = investmentMetrics.get(investment.id);
              const txs = transactionsMap[investment.id] ?? [];
              const lastSoldOn = txs
                .filter(t => t.type === 'Sell')
                .sort((a, b) => a.date.localeCompare(b.date))
                .at(-1)?.date ?? null;

              return (
                <div key={investment.id} className={cn('animate-enter', `delay-${(index % 5) + 1}`)}>
                <InvestmentCard
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
                </div>
              )
            })}
          </div>
        ) : (
          emptyState
        )}
        <button
          type="button"
          onClick={() => handleAddClick(typeFilter !== 'All' && typeFilter !== 'Futures' ? typeFilter : undefined)}
          className="md:hidden fixed right-4 z-50 inline-flex h-[52px] items-center gap-2 rounded-full bg-gradient-to-b from-[#63dbb3] to-[#3fc396] pl-4 pr-5 text-[14px] font-extrabold text-primary-foreground shadow-[0_0_0_1px_hsl(var(--primary)/.4),0_10px_30px_hsl(var(--primary)/.35),inset_0_1px_0_rgba(255,255,255,.35)] transition active:scale-[.98]"
          style={{ bottom: "calc(78px + env(safe-area-inset-bottom) + 12px)" }}
          aria-label="Add investment"
        >
          <Plus size={18} />
          Add
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
        sellYears={sellYears}
        yearFilter={yearFilter}
        onYearFilterChange={setYearFilterHoldingsSafe}
      >
        <div className="mx-auto w-full px-4 sm:px-6">
          {section === "summary" ? (
            <div className="pt-4">
              <PortfolioSummary
                ref={summaryRef}
                summaryData={summaryData}
                sellYears={sellYears}
                isTaxView={isTaxView}
                taxSettings={taxSettings}
                yearFilter={yearFilter}
                onYearFilterChange={setYearFilterHoldingsSafe}
                userId={user?.uid}
                investments={investments}
                transactionsMap={transactionsMap}
              />
            </div>
          ) : (
            investmentsView
          )}
        </div>
      </MobileAppShell>
  );

  const desktopView = (
      <div className="relative z-[1] min-h-[100svh] w-full">
        <DashboardHeader
            section={section}
            onSectionChange={setSection}
            isTaxView={isTaxView}
            onTaxViewChange={setIsTaxView}
            onTaxSettingsClick={() => setIsTaxSettingsOpen(true)}
            onViewTaxEstimate={handleOpenTaxEstimate}
            canViewTaxEstimate={canViewTaxEstimate}
            canToggleTaxReport={canToggleTaxReport}
            toggleDisabledReason={toggleDisabledReason}
            sellYears={sellYears}
            yearFilter={yearFilter}
            onYearFilterChange={setYearFilterHoldingsSafe}
        />
        <main className="mx-auto flex max-w-[1376px] flex-col gap-5 px-4 py-7 sm:px-6 lg:px-8">
          {/* Two pages, like mobile: Dashboard (summary) or Investments */}
          {section === "summary" ? (
          <PortfolioSummary
            ref={summaryRef}
            summaryData={summaryData}
            sellYears={sellYears}
            isTaxView={isTaxView}
            taxSettings={taxSettings}
            yearFilter={yearFilter}
            onYearFilterChange={setYearFilterHoldingsSafe}
            userId={user?.uid}
            investments={investments}
            transactionsMap={transactionsMap}
          />
          ) : (
          <>
          {/* Investments section header + filter rail */}
          <section className="animate-enter flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-headline text-[22px] font-bold tracking-tight">
                Investments
                <span className="ml-1.5 font-mono text-[13px] font-medium text-muted-foreground">
                  {filteredAndSortedInvestments.length} positions
                </span>
              </h2>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={handleRefreshPrices} disabled={isRefreshing}>
                  {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Refresh prices
                </Button>
                <Button onClick={() => handleAddClick(typeFilter !== 'All' && typeFilter !== 'Futures' ? typeFilter : undefined)}>
                  <Plus size={16} />
                  Add investment
                </Button>
              </div>
            </div>
            {advancedFilters}
          </section>

          {initialLoading ? (
             <div className="flex justify-center items-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : viewMode === 'list' ? (
              typeFilter === 'Futures' ? (
                <Card>
                  <CardContent>
                    <React.Suspense fallback={
                      <div className="p-8 text-center text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                        Loading futures data...
                      </div>
                    }>
                      <FuturesPositionsTable userId={user?.uid ?? ""} statusFilter={futuresStatusFilter} />
                    </React.Suspense>
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
            <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2 2xl:grid-cols-3">
              {filteredAndSortedInvestments.map((investment, index) => {
                const metrics = investmentMetrics.get(investment.id);
                const txs = transactionsMap[investment.id] ?? [];
                const lastSoldOn = txs
                  .filter(t => t.type === 'Sell')
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .at(-1)?.date ?? null;

                return (
                  <div key={investment.id} className={cn('animate-enter', `delay-${(index % 5) + 1}`)}>
                  <InvestmentCard
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
                  </div>
                )
              })}
            </div>
          ) : (
            emptyState
          )}
          </>
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

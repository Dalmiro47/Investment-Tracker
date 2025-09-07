
"use client";

import React from 'react';
import type { Investment, InvestmentType, InvestmentStatus, SortKey, InvestmentFormValues, Transaction, YearFilter, TaxSettings, EtfSimSummary } from '@/lib/types';
import { addInvestment, deleteInvestment, getInvestments, updateInvestment, getAllTransactionsForInvestments, getSellYears, getTaxSettings, updateTaxSettings, getAllEtfSummaries, getAllRateSchedules, addTransaction } from '@/lib/firestore';
import { refreshInvestmentPrices } from './actions';
import DashboardHeader from '@/components/dashboard-header';
import InvestmentCard from '@/components/investment-card';
import PortfolioSummary from '@/components/portfolio-summary';
import { InvestmentForm } from '@/components/investment-form';
import { TaxSettingsDialog } from '@/components/tax-settings-dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle, SlidersHorizontal, Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from "@/hooks/use-toast";
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
import { writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { doc } from 'firebase/firestore';
import { TransactionHistoryDialog } from '@/components/transaction-history-dialog';
import { performancePct } from '@/lib/types';
import { calculatePositionMetrics, aggregateByType } from '@/lib/portfolio';
import InvestmentListView from '@/components/investment-list';
import type { SavingsRateChange } from '@/lib/types-savings';
import RateScheduleDialog from "@/components/rate-schedule-dialog";
import { parseISO, endOfYear } from 'date-fns';
import EtfPlansButton from '@/components/etf/EtfPlansButton';


const todayISO = () => new Date().toISOString().slice(0,10);
const getCurrentRate = (rates?: SavingsRateChange[]) => {
  if (!rates || rates.length === 0) return null;
  const t = todayISO();
  const eligible = rates.filter(r => r.from <= t).sort((a,b)=>a.from.localeCompare(b.from));
  return eligible.length ? eligible[eligible.length-1].annualRatePct : rates[0].annualRatePct;
};

export default function DashboardPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [investments, setInvestments] = React.useState<Investment[]>([]);
  const [etfSummaries, setEtfSummaries] = React.useState<EtfSimSummary[]>([]);
  const [transactionsMap, setTransactionsMap] = React.useState<Record<string, Transaction[]>>({});
  const [rateSchedulesMap, setRateSchedulesMap] = React.useState<Record<string, SavingsRateChange[]>>({});
  const [sellYears, setSellYears] = React.useState<number[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isTaxView, setIsTaxView] = React.useState(false);
  const [typeFilter, setTypeFilter] = React.useState<InvestmentType | 'All'>('All');
  const [statusFilter, setStatusFilter] = React.useState<InvestmentStatus | 'All'>('All');
  const [sortKey, setSortKey] = React.useState<SortKey>('purchaseDate');
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
    cryptoMarginalRate: 0.42, // Default to a higher rate
  });

  const [yearFilter, setYearFilter] = React.useState<YearFilter>({ kind: 'all' });
  const [isRatesOpen, setIsRatesOpen] = React.useState(false);
  const [ratesInv, setRatesInv] = React.useState<Investment | null>(null);


  const fetchAllData = async (userId: string) => {
    setLoading(true);
    try {
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

      const yearSet = new Set<number>(years);
      for (const s of etfSums) {
        Object.keys(s.byYear ?? {}).forEach(y => {
          const n = parseInt(y, 10);
          if (!Number.isNaN(n)) yearSet.add(n);
        });
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
      setLoading(false);
    }
  };


  React.useEffect(() => {
    if (user) {
      fetchAllData(user.uid);
    }
  }, [user]);

  const handleRefreshPrices = async () => {
    if (!user || isRefreshing) return;

    setIsRefreshing(true);
    toast({ title: 'Refreshing Prices...', description: 'Please wait while we fetch the latest data.' });

    const result = await refreshInvestmentPrices(investments);

    if (result.success && result.updatedInvestments.length > 0) {
        const batch = writeBatch(db);
        result.updatedInvestments.forEach((updatedInv) => {
            const investmentRef = doc(db, 'users', user.uid, 'investments', updatedInv.id);
            batch.update(investmentRef, { currentValue: updatedInv.currentValue });
        });
        await batch.commit();
        await new Promise(resolve => setTimeout(resolve, 300));
        await fetchAllData(user.uid);
    }

    let toastVariant: "default" | "destructive" = "default";
    if ((result.failedInvestmentNames?.length ?? 0) > 0 && result.updatedInvestments.length === 0) {
        toastVariant = "destructive";
    }

    toast({
        title: toastVariant === "destructive" ? "Update Failed" : "Update Complete",
        description: result.message,
        variant: toastVariant,
        duration: (result.failedInvestmentNames?.length ?? 0) > 0 ? 10000 : 5000,
    });

    setIsRefreshing(false);
}

  // Investments scoped to the selected year for the LIST + tab counts
  const investmentsYearScoped = React.useMemo(() => {
    // start with all, then apply year rules for the list UX
    let subset = [...investments];

    if (yearFilter.kind === 'year') {
      const y = yearFilter.year;

      // sells in year
      const soldThisYear = new Set<string>();
      Object.entries(transactionsMap).forEach(([invId, txs]) => {
        if (txs.some(tx => tx.type === 'Sell' && new Date(tx.date).getFullYear() === y)) {
          soldThisYear.add(invId);
        }
      });

      const purchasedInYear = (inv: Investment) => {
        const d = parseISO(inv.purchaseDate);
        return d.getFullYear() === y;
      };
      const isActive = (inv: Investment) =>
        (inv.purchaseQuantity ?? 0) > (inv.totalSoldQty ?? 0) || inv.type === 'Interest Account';

      switch (yearFilter.mode) {
        case 'realized':
          subset = subset.filter(inv => soldThisYear.has(inv.id));
          break;
        case 'holdings':
          subset = subset.filter(inv => isActive(inv) && purchasedInYear(inv));
          break;
        case 'combined':
        default:
          subset = subset.filter(inv =>
            soldThisYear.has(inv.id) || (isActive(inv) && purchasedInYear(inv))
          );
          break;
      }
    }

    return subset;
  }, [investments, transactionsMap, yearFilter]);

  const typeCounts = React.useMemo(() => {
    const counts: Record<InvestmentType | 'All', number> = {
      'All': 0,
      'Stock': 0,
      'Crypto': 0,
      'ETF': 0,
      'Interest Account': 0,
      'Bond': 0,
      'Real Estate': 0,
    };
    
    let totalManual = 0;
    investmentsYearScoped.forEach(inv => {
      if (counts[inv.type] !== undefined) {
        counts[inv.type]++;
        totalManual++;
      }
    });

    const includePlans = (viewMode === 'list' && listMode === 'aggregated');
    counts['ETF'] += includePlans ? etfSummaries.length : 0;
    counts['All'] = totalManual + (includePlans ? etfSummaries.length : 0);

    return counts;
  }, [investmentsYearScoped, etfSummaries, viewMode, listMode]);

  const filteredAndSortedInvestments = React.useMemo(() => {
    let filtered = [...investmentsYearScoped]; // <-- year scoped first

    if (typeFilter !== 'All') {
      filtered = filtered.filter(inv => inv.type === typeFilter);
    }
    if (statusFilter !== 'All') {
      filtered = filtered.filter(inv => inv.status === statusFilter);
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
  }, [investmentsYearScoped, typeFilter, statusFilter, sortKey]);

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
  
  const summaryData = React.useMemo(() => {
    return aggregateByType(investments, transactionsMap, etfSummaries, yearFilter, isTaxView ? taxSettings : null, rateSchedulesMap);
  }, [investments, transactionsMap, etfSummaries, yearFilter, isTaxView, taxSettings, rateSchedulesMap]);


  const handleAddClick = (prefill?: InvestmentType) => {
    setEditingInvestment(undefined);
    setPrefillType(prefill);
    setIsFormOpen(true);
  };

  const handleEditClick = (investment: Investment) => {
    setEditingInvestment(investment);
    setIsFormOpen(true);
  };

  const handleHistoryClick = (investment: Investment) => {
    setViewingHistoryInvestment(investment);
    setHistoryDialogView('list');
    setIsHistoryOpen(true);
  }

  const handleAddTransactionClick = (investment: Investment) => {
    setViewingHistoryInvestment(investment);
    setHistoryDialogView('form');
    setIsHistoryOpen(true);
  };
  
  const handleDeleteClick = (id: string) => {
    setDeletingInvestmentId(id);
    setIsDeleteDialogOpen(true);
  }

  const confirmDelete = async () => {
    if (deletingInvestmentId && user) {
      await deleteInvestment(user.uid, deletingInvestmentId);
      await fetchAllData(user.uid);
      toast({ title: "Success", description: "Investment deleted successfully." });
    }
    setIsDeleteDialogOpen(false);
    setDeletingInvestmentId(null);
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
        }
        await fetchAllData(user.uid);
        setIsFormOpen(false);
        setEditingInvestment(undefined);
        toast({
            title: "Success",
            description: `Investment ${isEditing ? 'updated' : 'added'} successfully.`,
        });
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
    if(user) {
        await fetchAllData(user.uid);
    }
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
    setRatesInv(inv);
    setIsRatesOpen(true);
  };
  
  if (!user) {
    return null; // AuthProvider handles redirects
  }

  return (
    <>
      <div className="min-h-screen w-full bg-background">
        <DashboardHeader 
            isTaxView={isTaxView} 
            onTaxViewChange={setIsTaxView}
            onTaxSettingsClick={() => setIsTaxSettingsOpen(true)}
        />
        <main className="p-4 sm:p-6 lg:p-8">
          <PortfolioSummary 
            summaryData={summaryData}
            sellYears={sellYears} 
            isTaxView={isTaxView}
            taxSettings={taxSettings}
            yearFilter={yearFilter}
            onYearFilterChange={setYearFilter}
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
                    className={`px-3 py-1 rounded ${viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                    onClick={() => setViewMode('grid')}
                  >
                    Cards
                  </button>
                  <button
                    className={`px-3 py-1 rounded ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                    onClick={() => setViewMode('list')}
                  >
                    List
                  </button>
                </div>

                {viewMode === 'list' && (
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
                 <Button onClick={() => handleAddClick(typeFilter !== 'All' ? typeFilter : undefined)}>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Add Investment
                </Button>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-4 mt-4">
              <div className="w-full sm:w-auto">
                <Tabs value={typeFilter} onValueChange={(value) => setTypeFilter(value as InvestmentType | 'All')}>
                  <TabsList className="flex-wrap h-auto">
                    <TabsTrigger value="All">All Types ({typeCounts.All})</TabsTrigger>
                    <TabsTrigger value="Stock">Stocks ({typeCounts.Stock})</TabsTrigger>
                    <TabsTrigger value="Crypto">Crypto ({typeCounts.Crypto})</TabsTrigger>
                    <TabsTrigger value="ETF">ETFs ({typeCounts.ETF})</TabsTrigger>
                    <TabsTrigger value="Interest Account">Interest Accounts ({typeCounts['Interest Account']})</TabsTrigger>
                    <TabsTrigger value="Bond">Bonds ({typeCounts.Bond})</TabsTrigger>
                    <TabsTrigger value="Real Estate">Real Estate ({typeCounts['Real Estate']})</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <div className="flex-grow" />
              <div className="flex items-center gap-4 w-full sm:w-auto">
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as InvestmentStatus | 'All')}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Statuses</SelectItem>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Sold">Sold</SelectItem>
                  </SelectContent>
                </Select>
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
            </div>
          </div>
          
          {loading ? (
             <div className="flex justify-center items-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : viewMode === 'list' ? (
              <InvestmentListView
                investments={filteredAndSortedInvestments}
                transactionsMap={transactionsMap}
                rateSchedulesMap={rateSchedulesMap}
                yearFilter={yearFilter}
                showTypeColumn={typeFilter === 'All'}
                mode={listMode}
                sortKey={sortKey}
                statusFilter={statusFilter}
                activeTypeFilter={typeFilter}
                onViewHistory={(id) => {
                  const inv = investments.find((i) => i.id === id);
                  if (inv) handleHistoryClick(inv);
                }}
                onAddTransaction={(id) => {
                  const inv = investments.find((i) => i.id === id);
                  if (inv) handleAddTransactionClick(inv);
                }}
              />
            ) : filteredAndSortedInvestments.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredAndSortedInvestments.map(investment => {
                const metrics = investmentMetrics.get(investment.id);
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
                  />
                )
              })}
            </div>
          ) : (
            <div className="text-center py-16">
              <h3 className="text-xl font-semibold text-foreground">No Investments Found</h3>
              <p className="text-muted-foreground mt-2">Add a new investment to get started.</p>
              <div className="mt-4 flex items-center justify-center gap-3">
                <Button onClick={() => handleAddClick(typeFilter !== 'All' ? typeFilter : undefined)}>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Add First Investment
                </Button>
               {typeFilter === 'ETF' && <EtfPlansButton />}
              </div>
            </div>
          )}
        </main>
      </div>
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
        <AlertDialogContent>
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

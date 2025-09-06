

"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Investment, InvestmentType, InvestmentStatus, SortKey, InvestmentFormValues, Transaction, YearFilter, TaxSettings, EtfSimSummary } from '@/lib/types';
import { addInvestment, deleteInvestment, getInvestments, updateInvestment, getAllTransactionsForInvestments, getSellYears, getTaxSettings, updateTaxSettings, getAllEtfSummaries } from '@/lib/firestore';
import { refreshInvestmentPrices } from './actions';
import DashboardHeader from '@/components/dashboard-header';
import InvestmentCard from '@/components/investment-card';
import PortfolioSummary from '@/components/portfolio-summary';
import { InvestmentForm } from '@/components/investment-form';
import { TaxSettingsDialog } from '@/components/tax-settings-dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle, SlidersHorizontal, Loader2, RefreshCw, Briefcase } from 'lucide-react';
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


export default function DashboardPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [etfSummaries, setEtfSummaries] = useState<EtfSimSummary[]>([]);
  const [transactionsMap, setTransactionsMap] = useState<Record<string, Transaction[]>>({});
  const [sellYears, setSellYears] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isTaxView, setIsTaxView] = useState(false);
  const [typeFilter, setTypeFilter] = useState<InvestmentType | 'All'>('All');
  const [statusFilter, setStatusFilter] = useState<InvestmentStatus | 'All'>('All');
  const [sortKey, setSortKey] = useState<SortKey>('purchaseDate');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [listMode, setListMode] = useState<'aggregated' | 'flat'>('aggregated');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingInvestment, setEditingInvestment] = useState<Investment | undefined>(undefined);
  
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingInvestmentId, setDeletingInvestmentId] = useState<string | null>(null);

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyDialogView, setHistoryDialogView] = useState<'list' | 'form'>('list');
  const [viewingHistoryInvestment, setViewingHistoryInvestment] = useState<Investment | undefined>(undefined);

  const [isTaxSettingsOpen, setIsTaxSettingsOpen] = useState(false);
  const [taxSettings, setTaxSettings] = useState<TaxSettings>({
    filingStatus: 'single',
    churchTaxRate: 0,
    cryptoMarginalRate: 0.42, // Default to a higher rate
  });

  const [yearFilter, setYearFilter] = useState<YearFilter>({ kind: 'all' });


  const fetchAllData = async (userId: string) => {
    setLoading(true);
    try {
      const [userInvestments, etfSums, years, settings] = await Promise.all([
        getInvestments(userId),
        getAllEtfSummaries(userId),
        getSellYears(userId),
        getTaxSettings(userId),
      ]);
      
      setInvestments(userInvestments);
      setEtfSummaries(etfSums);

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


  useEffect(() => {
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

  const typeCounts = useMemo(() => {
    const counts: Record<InvestmentType | 'All', number> = {
      'All': 0,
      'Stock': 0,
      'Crypto': 0,
      'ETF': 0,
      'Savings': 0,
      'Bond': 0,
      'Real Estate': 0,
    };
    
    let totalManual = 0;
    investments.forEach(inv => {
      if (counts[inv.type] !== undefined) {
        counts[inv.type]++;
        totalManual++;
      }
    });

    counts['ETF'] += etfSummaries.length;
    counts['All'] = totalManual + etfSummaries.length;

    return counts;
  }, [investments, etfSummaries]);

  const filteredAndSortedInvestments = useMemo(() => {
    let filtered = [...investments];

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
        case 'totalAmount':
           const availableA = a.purchaseQuantity - (a.totalSoldQty ?? 0);
           const availableB = b.purchaseQuantity - (b.totalSoldQty ?? 0);
           const totalA = (a.currentValue ?? 0) * availableA;
           const totalB = (b.currentValue ?? 0) * availableB;
           return totalB - totalA;
        case 'purchaseDate':
        default:
          const dateA = a.purchaseDate ? new Date(a.purchaseDate).getTime() : 0;
          const dateB = b.purchaseDate ? new Date(b.purchaseDate).getTime() : 0;
          return dateB - dateA;
      }
    });
  }, [investments, typeFilter, statusFilter, sortKey]);

  const investmentMetrics = useMemo(() => {
    const metricsMap = new Map<string, ReturnType<typeof calculatePositionMetrics>>();
    if (Object.keys(transactionsMap).length > 0) {
      filteredAndSortedInvestments.forEach(inv => {
        const metrics = calculatePositionMetrics(inv, transactionsMap[inv.id] ?? [], yearFilter);
        metricsMap.set(inv.id, metrics);
      });
    }
    return metricsMap;
  }, [filteredAndSortedInvestments, transactionsMap, yearFilter]);
  
  const summaryData = useMemo(() => {
    return aggregateByType(investments, transactionsMap, etfSummaries, yearFilter, isTaxView ? taxSettings : null);
  }, [investments, transactionsMap, etfSummaries, yearFilter, isTaxView, taxSettings]);


  const handleAddClick = () => {
    setEditingInvestment(undefined);
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


  const handleFormSubmit = async (values: InvestmentFormValues) => {
    if (!user) return;
    
    const isEditing = !!editingInvestment;
    try {
        if (isEditing) {
          await updateInvestment(user.uid, editingInvestment.id, values);
        } else {
          await addInvestment(user.uid, values);
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
                <Button onClick={() => router.push('/etf')}>
                  <Briefcase className="mr-2 h-4 w-4" />
                  ETF Plans
                </Button>
                 <Button onClick={handleAddClick}>
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
                    <TabsTrigger value="Savings">Savings ({typeCounts.Savings})</TabsTrigger>
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
                yearFilter={yearFilter}
                showTypeColumn={typeFilter === 'All'}
                mode={listMode}
                sortKey={sortKey}
                statusFilter={statusFilter}
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
                    isTaxView={isTaxView}
                    onEdit={() => handleEditClick(investment)}
                    onDelete={() => handleDeleteClick(investment.id)}
                    onViewHistory={() => handleHistoryClick(investment)}
                    onAddTransaction={() => handleAddTransactionClick(investment)}
                    taxSettings={taxSettings}
                    realizedPLYear={metrics?.realizedPLYear ?? 0}
                    dividendsYear={metrics?.dividendsYear ?? 0}
                    interestYear={metrics?.interestYear ?? 0}
                  />
                )
              })}
            </div>
          ) : (
            <div className="text-center py-16">
              <h3 className="text-xl font-semibold text-foreground">No Investments Found</h3>
              <p className="text-muted-foreground mt-2">Add a new investment to get started.</p>
               <Button onClick={handleAddClick} className="mt-4">
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Add First Investment
                </Button>
            </div>
          )}
        </main>
      </div>
      <InvestmentForm 
        isOpen={isFormOpen}
        onOpenChange={setIsFormOpen}
        onSubmit={handleFormSubmit}
        investment={editingInvestment}
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
    </>
  );
}

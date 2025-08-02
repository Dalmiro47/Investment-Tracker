"use client";

import React, { useState, useMemo, useEffect, useTransition } from 'react';
import type { Investment, InvestmentType, InvestmentStatus, SortKey, InvestmentFormValues } from '@/lib/types';
import { addInvestment, deleteInvestment, getInvestments, updateInvestment } from '@/lib/firestore';
import { refreshInvestmentPrices } from '@/app/actions';
import DashboardHeader from '@/components/dashboard-header';
import InvestmentCard from '@/components/investment-card';
import { InvestmentForm } from '@/components/investment-form';
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

export default function DashboardPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);
  const [isTaxView, setIsTaxView] = useState(false);
  const [typeFilter, setTypeFilter] = useState<InvestmentType | 'All'>('All');
  const [statusFilter, setStatusFilter] = useState<InvestmentStatus | 'All'>('All');
  const [sortKey, setSortKey] = useState<SortKey>('purchaseDate');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingInvestment, setEditingInvestment] = useState<Investment | undefined>(undefined);
  
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingInvestmentId, setDeletingInvestmentId] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();

  const fetchInvestments = async (userId: string) => {
    setLoading(true);
    const userInvestments = await getInvestments(userId);
    setInvestments(userInvestments);
    setLoading(false);
  };

  useEffect(() => {
    if (user) {
      fetchInvestments(user.uid);
    }
  }, [user]);

  const handleRefreshPrices = () => {
    startTransition(async () => {
      if (!user) return;
      
      toast({ title: 'Refreshing Prices...', description: 'Please wait while we fetch the latest data.' });
      
      const result = await refreshInvestmentPrices();

      if (result.success) {
        toast({
          title: "Update Complete",
          description: result.message,
          variant: result.failed > 0 ? "destructive" : "default",
        });
        // Refetch investments to show updated prices
        await fetchInvestments(user.uid);
      } else {
        toast({
          title: "Update Failed",
          description: result.message,
          variant: "destructive",
        });
      }
    });
  }

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
          const performanceA = a.currentValue && a.initialValue ? (a.currentValue - a.initialValue) / a.initialValue : 0;
          const performanceB = b.currentValue && b.initialValue ? (b.currentValue - b.initialValue) / b.initialValue : 0;
          return performanceB - performanceA;
        case 'totalAmount':
          return (b.currentValue ?? 0) * b.quantity - (a.currentValue ?? 0) * a.quantity;
        case 'purchaseDate':
        default:
          return new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime();
      }
    });
  }, [investments, typeFilter, statusFilter, sortKey]);

  const handleAddClick = () => {
    setEditingInvestment(undefined);
    setIsFormOpen(true);
  };

  const handleEditClick = (investment: Investment) => {
    setEditingInvestment(investment);
    setIsFormOpen(true);
  };
  
  const handleDeleteClick = (id: string) => {
    setDeletingInvestmentId(id);
    setIsDeleteDialogOpen(true);
  }

  const confirmDelete = async () => {
    if (deletingInvestmentId && user) {
      await deleteInvestment(user.uid, deletingInvestmentId);
      setInvestments(investments.filter(inv => inv.id !== deletingInvestmentId));
    }
    setIsDeleteDialogOpen(false);
    setDeletingInvestmentId(null);
  }


  const handleFormSubmit = async (values: InvestmentFormValues) => {
    if (!user) return;
    
    if (editingInvestment) {
      const updatedInvestment = await updateInvestment(user.uid, editingInvestment.id, values);
      setInvestments(investments.map(inv => inv.id === editingInvestment.id ? updatedInvestment : inv));
    } else {
      const newInvestment = await addInvestment(user.uid, values);
      setInvestments([newInvestment, ...investments]);
    }
    setIsFormOpen(false);
    setEditingInvestment(undefined);
  };
  
  if (!user) {
    return null; // AuthProvider handles redirects
  }

  return (
    <>
      <div className="min-h-screen w-full bg-background">
        <DashboardHeader isTaxView={isTaxView} onTaxViewChange={setIsTaxView} />
        <main className="p-4 sm:p-6 lg:p-8">
          <div className="mb-8 p-4 bg-card/50 rounded-lg shadow-sm">
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-5 w-5 text-muted-foreground"/>
                <h2 className="text-lg font-semibold">Filters &amp; Sorting</h2>
              </div>
              <div className="flex-grow" />
              <div className="flex items-center gap-4 w-full sm:w-auto">
                 <Button onClick={handleRefreshPrices} disabled={isPending}>
                  {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Refresh Prices
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
                    <TabsTrigger value="All">All Types</TabsTrigger>
                    <TabsTrigger value="Stock">Stocks</TabsTrigger>
                    <TabsTrigger value="Crypto">Crypto</TabsTrigger>
                    <TabsTrigger value="ETF">ETFs</TabsTrigger>
                    <TabsTrigger value="Savings">Savings</TabsTrigger>
                    <TabsTrigger value="Bond">Bonds</TabsTrigger>
                    <TabsTrigger value="Real Estate">Real Estate</TabsTrigger>
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
          ) : filteredAndSortedInvestments.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredAndSortedInvestments.map(investment => (
                <InvestmentCard 
                  key={investment.id} 
                  investment={investment} 
                  isTaxView={isTaxView}
                  onEdit={() => handleEditClick(investment)}
                  onDelete={() => handleDeleteClick(investment.id)}
                />
              ))}
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
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

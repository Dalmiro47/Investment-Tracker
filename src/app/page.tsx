"use client";

import React, { useState, useMemo, useEffect } from 'react';
import type { Investment, InvestmentType, InvestmentStatus, SortKey, InvestmentFormValues } from '@/lib/types';
import { mockInvestments } from '@/lib/data';
import DashboardHeader from '@/components/dashboard-header';
import InvestmentCard from '@/components/investment-card';
import { InvestmentForm } from '@/components/investment-form';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle, SlidersHorizontal } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
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
  const { user, loading } = useAuth();
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [isTaxView, setIsTaxView] = useState(false);
  const [typeFilter, setTypeFilter] = useState<InvestmentType | 'All'>('All');
  const [statusFilter, setStatusFilter] = useState<InvestmentStatus | 'All'>('All');
  const [sortKey, setSortKey] = useState<SortKey>('purchaseDate');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingInvestment, setEditingInvestment] = useState<Investment | undefined>(undefined);
  
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingInvestmentId, setDeletingInvestmentId] = useState<string | null>(null);

  useEffect(() => {
    // In a real app, you'd fetch this from a database.
    // For now, we'll use the mock data and store it in local state.
    setInvestments(mockInvestments);
  }, []);

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
          const performanceA = (a.currentValue - a.initialValue) / a.initialValue;
          const performanceB = (b.currentValue - b.initialValue) / b.initialValue;
          return performanceB - performanceA;
        case 'totalAmount':
          const totalA = a.currentValue * a.quantity;
          const totalB = b.currentValue * b.quantity;
          return totalB - totalA;
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

  const confirmDelete = () => {
    if (deletingInvestmentId) {
      setInvestments(investments.filter(inv => inv.id !== deletingInvestmentId));
    }
    setIsDeleteDialogOpen(false);
    setDeletingInvestmentId(null);
  }


  const handleFormSubmit = (values: InvestmentFormValues) => {
    if (editingInvestment) {
      // Edit existing investment
      setInvestments(investments.map(inv => inv.id === editingInvestment.id ? { ...inv, ...values, purchaseDate: values.purchaseDate.toISOString() } : inv));
    } else {
      // Add new investment
      const newInvestment: Investment = {
        ...values,
        id: new Date().toISOString(), // simple unique id
        purchaseDate: values.purchaseDate.toISOString(),
      };
      setInvestments([newInvestment, ...investments]);
    }
    setIsFormOpen(false);
    setEditingInvestment(undefined);
  };
  
  if (loading || !user) {
    return null; // The AuthProvider will handle rendering a loading state or redirecting
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
                 <Button onClick={handleAddClick}>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Add Investment
                </Button>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-4 mt-4">
              <div className="w-full sm:w-auto">
                <Tabs value={typeFilter} onValueChange={(value) => setTypeFilter(value as InvestmentType | 'All')}>
                  <TabsList>
                    <TabsTrigger value="All">All Types</TabsTrigger>
                    <TabsTrigger value="Stock">Stocks</TabsTrigger>
                    <TabsTrigger value="Bond">Bonds</TabsTrigger>
                    <TabsTrigger value="Crypto">Crypto</TabsTrigger>
                    <TabsTrigger value="ETF">ETFs</TabsTrigger>
                    <TabsTrigger value="Savings">Savings</TabsTrigger>
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
          
          {filteredAndSortedInvestments.length > 0 ? (
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
              <p className="text-muted-foreground mt-2">Adjust your filters or add a new investment to get started.</p>
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
              This action cannot be undone. This will permanently remove the investment data from our servers.
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

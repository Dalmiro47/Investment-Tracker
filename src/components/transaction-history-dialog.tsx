

"use client"

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { getTransactions, addTransaction, updateTransaction, deleteTransaction } from "@/lib/firestore";
import type { Investment, Transaction, TransactionFormValues } from "@/lib/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { transactionSchema } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils";
import { CalendarIcon, PlusCircle, Loader2, MoreHorizontal, Edit, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { aggregate } from "@/lib/utils/agg";

// --- TransactionForm ---
interface TransactionFormProps {
  investment: Investment;
  editingTransaction?: Transaction;
  onFormSubmit: () => void;
  onCancel: () => void;
}

function TransactionForm({ investment, editingTransaction, onFormSubmit, onCancel }: TransactionFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues: editingTransaction 
      ? { ...editingTransaction, date: new Date(editingTransaction.date) }
      : {
          type: "Sell",
          date: new Date(),
          quantity: 0,
          pricePerUnit: 0,
        },
  });

  useEffect(() => {
    async function setupForm() {
        if (editingTransaction) {
            form.reset({
                ...editingTransaction,
                date: new Date(editingTransaction.date),
            });
        } else if (user) {
            const fetchedTransactions = await getTransactions(user.uid, investment.id);
            const agg = aggregate(fetchedTransactions, investment.currentValue);
             form.reset({
                type: "Sell",
                date: new Date(),
                quantity: agg.availableQty,
                pricePerUnit: investment.currentValue ?? 0,
             });
        }
    }
    setupForm();
  }, [editingTransaction, investment, user, form])


  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  const handleSubmit = async (values: TransactionFormValues) => {
    if (!user) return;
    try {
      if (editingTransaction) {
        await updateTransaction(user.uid, investment.id, editingTransaction.id, values);
        toast({ title: "Success", description: "Transaction updated successfully." });
      } else {
        await addTransaction(user.uid, investment.id, values);
        toast({ title: "Success", description: "Transaction added successfully." });
      }
      onFormSubmit();
    } catch (error) {
      console.error("Failed to save transaction:", error);
      toast({ title: "Error", description: `Failed to save transaction: ${(error as Error).message}`, variant: "destructive" });
    }
  };

  const isInitialBuy = editingTransaction?.id === 'synthetic-initial-buy';

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Type</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isInitialBuy}>
                <FormControl>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                </FormControl>
                <SelectContent>
                  {!isInitialBuy && <SelectItem value="Sell">Sell</SelectItem>}
                  <SelectItem value="Buy">Buy</SelectItem>
                  <SelectItem value="Dividend">Dividend</SelectItem>
                  <SelectItem value="Interest">Interest</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Date</FormLabel>
              <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button variant="outline" className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                      {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={field.value}
                    onSelect={(date) => {
                      if (date) field.onChange(date);
                      setIsCalendarOpen(false);
                    }}
                    disabled={(date) => date > new Date() || date < new Date("1900-01-01")}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="quantity"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Quantity</FormLabel>
              <FormControl>
                <Input type="number" step="any" placeholder="e.g. 10" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="pricePerUnit"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Price per Unit (€)</FormLabel>
              <FormControl>
                <Input type="number" step="any" placeholder="e.g. 150.50" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} />
              </FormControl>
            </FormItem>
          )}
        />
        <div className="md:col-span-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={form.formState.isSubmitting}>Cancel</Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Save Transaction'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

// --- TransactionHistoryDialog ---
interface TransactionHistoryDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  investment: Investment;
  onTransactionAdded: () => void;
}

const formatCurrency = (value: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
const formatQuantity = (value: number) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 8 }).format(value);

export function TransactionHistoryDialog({ isOpen, onOpenChange, investment, onTransactionAdded }: TransactionHistoryDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'form'>('list');
  const [editingTransaction, setEditingTransaction] = useState<Transaction | undefined>(undefined);
  const [deletingTransactionId, setDeletingTransactionId] = useState<string | null>(null);

  const fetchTransactions = async () => {
      if (!user) return;
      setLoading(true);
      
      let fetchedTransactions = await getTransactions(user.uid, investment.id);
      
      const hasBuyTransaction = fetchedTransactions.some(tx => tx.type === 'Buy');
      
      if (!hasBuyTransaction && investment.initialValue > 0 && investment.purchaseDate) {
          const totalCost = investment.totalCost ?? (investment.initialValue * investment.quantity);
          const initialQty = investment.averageBuyPrice && investment.averageBuyPrice > 0 ? totalCost / investment.averageBuyPrice : investment.quantity;

          const syntheticInitialBuy: Transaction = {
              id: 'synthetic-initial-buy',
              type: 'Buy',
              date: investment.purchaseDate,
              quantity: initialQty, 
              pricePerUnit: investment.initialValue,
              totalAmount: totalCost
          };
          fetchedTransactions = [syntheticInitialBuy, ...fetchedTransactions];
      }

      fetchedTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      setTransactions(fetchedTransactions);
      setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      fetchTransactions();
      setView('list');
    }
  }, [isOpen, user, investment.id]);

  const handleFormSubmit = () => {
    setView('list');
    fetchTransactions();
    onTransactionAdded(); // This should trigger a refetch on the main page
  }
  
  const handleAddClick = () => {
    setEditingTransaction(undefined);
    setView('form');
  }

  const handleEditClick = (tx: Transaction) => {
    setEditingTransaction(tx);
    setView('form');
  }

  const handleDeleteClick = (id: string) => {
    setDeletingTransactionId(id);
  }

  const confirmDelete = async () => {
    if (!deletingTransactionId || !user) return;
    try {
      await deleteTransaction(user.uid, investment.id, deletingTransactionId);
      toast({ title: "Success", description: "Transaction deleted." });
      fetchTransactions(); // Refetch after delete
      onTransactionAdded();
    } catch (error) {
      console.error("Failed to delete transaction", error);
      toast({ title: "Error", description: `Failed to delete transaction: ${(error as Error).message}`, variant: "destructive" });
    } finally {
      setDeletingTransactionId(null);
    }
  }


  return (
    <>
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {view === 'form' 
                ? (editingTransaction ? 'Edit Transaction' : 'Add Transaction') 
                : `Transaction History: ${investment.name}`}
            </DialogTitle>
            <DialogDescription>
              {view === 'form' 
                ? 'Update the details for this transaction.'
                : 'View and manage all transactions for this investment.'}
            </DialogDescription>
          </DialogHeader>

          {view === 'form' ? (
            <TransactionForm 
              investment={investment}
              editingTransaction={editingTransaction}
              onFormSubmit={handleFormSubmit}
              onCancel={() => setView('list')}
            />
          ) : (
            <>
              <div className="max-h-[60vh] overflow-y-auto pr-2">
                {loading ? (
                  <div className="flex justify-center items-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                ) : transactions.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead className="text-right">Price/Unit</TableHead>
                        <TableHead className="text-right">Total Amount</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map((tx) => (
                        <TableRow key={tx.id}>
                          <TableCell>
                            <span className={cn(
                                'font-semibold',
                                tx.type === 'Buy' && 'text-green-500',
                                tx.type === 'Sell' && 'text-red-500',
                                tx.type === 'Dividend' && 'text-blue-500',
                                tx.type === 'Interest' && 'text-purple-500',
                            )}>
                              {tx.type}
                            </span>
                          </TableCell>
                          <TableCell>{format(new Date(tx.date), 'dd MMM yyyy')}</TableCell>
                          <TableCell className="text-right font-mono">{formatQuantity(tx.quantity)}</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(tx.pricePerUnit)}</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(tx.totalAmount)}</TableCell>
                          <TableCell className="text-right">
                             {tx.id !== 'synthetic-initial-buy' && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                            <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => handleEditClick(tx)}>
                                            <Edit className="mr-2 h-4 w-4" /> Edit
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleDeleteClick(tx.id)} className="text-destructive focus:text-destructive">
                                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                             )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-16">
                    <p className="text-muted-foreground">No transactions recorded yet.</p>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button onClick={handleAddClick}>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Add Transaction
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      
      <AlertDialog open={!!deletingTransactionId} onOpenChange={(open) => !open && setDeletingTransactionId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete this transaction and recalculate your investment summary.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

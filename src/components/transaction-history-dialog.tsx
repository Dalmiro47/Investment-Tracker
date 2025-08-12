
"use client"

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { getTransactions, addTransaction } from "@/lib/firestore";
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
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
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
import { cn } from "@/lib/utils";
import { CalendarIcon, PlusCircle, Loader2 } from "lucide-react";
import { format } from "date-fns";

// --- TransactionForm ---
interface TransactionFormProps {
  investmentId: string;
  availableQuantity: number;
  onFormSubmit: () => void;
  onCancel: () => void;
}

function TransactionForm({ investmentId, availableQuantity, onFormSubmit, onCancel }: TransactionFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      type: "Sell",
      date: new Date(),
      quantity: availableQuantity, // Pre-fill with available quantity
      pricePerUnit: 0,
    },
  });

  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  const handleSubmit = async (values: TransactionFormValues) => {
    if (!user) return;
    try {
      await addTransaction(user.uid, investmentId, values);
      toast({ title: "Success", description: "Transaction added successfully." });
      onFormSubmit();
    } catch (error) {
      console.error("Failed to add transaction:", error);
      toast({ title: "Error", description: "Failed to add transaction.", variant: "destructive" });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Type</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Sell">Sell</SelectItem>
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
                <Input type="number" placeholder="e.g. 10" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} />
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
                <Input type="number" placeholder="e.g. 150.50" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} />
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
const formatQuantity = (value: number) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 4 }).format(value);

export function TransactionHistoryDialog({ isOpen, onOpenChange, investment, onTransactionAdded }: TransactionHistoryDialogProps) {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);

  const fetchTransactions = async () => {
      if (!user) return;
      setLoading(true);
      
      let fetchedTransactions = await getTransactions(user.uid, investment.id);
      
      const hasBuyTransaction = fetchedTransactions.some(tx => tx.type === 'Buy');
      
      // The synthetic "Buy" was created from the original investment. This should always exist
      // even if the real transaction list is empty.
      if (!hasBuyTransaction && investment.initialValue > 0 && investment.purchaseDate) {
          const syntheticInitialBuy: Transaction = {
              id: 'synthetic-initial-buy',
              type: 'Buy',
              date: investment.purchaseDate,
              quantity: investment.quantity, // This is the original quantity
              pricePerUnit: investment.initialValue,
              totalAmount: investment.initialValue * investment.quantity
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
      setIsAdding(false);
    }
  }, [isOpen, user, investment.id]);

  const handleFormSubmit = () => {
    setIsAdding(false);
    fetchTransactions();
    onTransactionAdded();
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Transaction History: {investment.name}</DialogTitle>
          <DialogDescription>View and manage all transactions for this investment.</DialogDescription>
        </DialogHeader>

        {isAdding ? (
          <TransactionForm 
            investmentId={investment.id}
            availableQuantity={investment.quantity}
            onFormSubmit={handleFormSubmit}
            onCancel={() => setIsAdding(false)}
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
              <Button onClick={() => setIsAdding(true)}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Transaction
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

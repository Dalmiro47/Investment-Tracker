"use client"

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { getTransactions, addTransaction, deleteTransaction, updateTransaction } from "@/lib/firestore";
import type { Investment, Transaction, TransactionFormValues } from "@/lib/types";
import { availableQty } from "@/lib/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch, Controller } from "react-hook-form";
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
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
    FormMessage
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { PlusCircle, Loader2, MoreVertical, Edit, Trash2, ArrowLeft } from "lucide-react";
import { format, parseISO } from "date-fns";
import AppDatePicker from "./ui/app-date-picker";

// --- TransactionForm ---
// (No changes to logic, just wrapped in the new layout structure in the parent)
interface TransactionFormProps {
    investment: Investment;
    onFormSubmit: () => void;
    onCancel: () => void;
    editingTransaction?: Transaction;
}

function TransactionForm({ investment, onFormSubmit, onCancel, editingTransaction }: TransactionFormProps) {
    const { user } = useAuth();
    const { toast } = useToast();

    const form = useForm<TransactionFormValues>({
        resolver: zodResolver(transactionSchema),
        defaultValues: {
            type: "Sell",
            date: new Date(),
            quantity: 0,
            pricePerUnit: 0,
            amount: 0,
        }
    });

    const typeOptions = useMemo(
        () =>
            investment.type === 'Interest Account'
                ? (['Deposit', 'Withdrawal'] as const)
                : (['Sell', 'Dividend', 'Interest'] as const),
        [investment.type]
    );

    const initKeyRef = useRef<string | null>(null);

    useEffect(() => {
        const initKey = `${editingTransaction?.id ?? 'new'}|${typeOptions.join(',')}`;
        if (initKeyRef.current === initKey) return; 
        initKeyRef.current = initKey;

        if (editingTransaction) {
            form.reset({
                ...editingTransaction,
                date: parseISO(editingTransaction.date),
                amount: editingTransaction.type !== 'Sell' ? editingTransaction.totalAmount : 0,
            });
        } else {
            const defaultType = typeOptions[0];
            form.reset({
                type: defaultType,
                date: new Date(),
                quantity: defaultType === 'Sell' ? availableQty(investment) : 0,
                pricePerUnit: defaultType === 'Sell' ? (investment.currentValue ?? 0) : 0,
                amount: 0,
            });
        }
    }, [editingTransaction, typeOptions, investment, form]);

    const watchedType = useWatch({ control: form.control, name: "type" });

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

    return (
        <Form {...form}>
            <form id="transaction-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="type"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Type</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl>
                                        <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {typeOptions.map(o => (
                                            <SelectItem key={o} value={o}>{o}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                     <FormItem>
                        <FormLabel>Date</FormLabel>
                         <Controller
                            control={form.control}
                            name="date"
                            render={({ field }) => (
                                <AppDatePicker
                                value={field.value ?? null}
                                onChange={field.onChange}
                                placeholder="dd/mm/yyyy"
                                maxDate={new Date()}
                                />
                            )}
                        />
                     </FormItem>
                </div>

                {watchedType === 'Sell' && (
                    <div className="grid grid-cols-2 gap-4">
                        <FormField
                            control={form.control}
                            name="quantity"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Quantity Sold</FormLabel>
                                    <FormControl>
                                        <Input type="number" step="any" placeholder="e.g. 10" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="pricePerUnit"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Price / Unit (€)</FormLabel>
                                    <FormControl>
                                        <Input type="number" step="any" placeholder="e.g. 150.50" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                )}

                {(watchedType !== 'Sell') && (
                    <FormField
                        control={form.control}
                        name="amount"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Total Amount (€)</FormLabel>
                                <FormControl>
                                    <Input type="number" step="any" placeholder="e.g. 50.00" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                )}
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
    initialView?: 'list' | 'form';
}

const formatCurrency = (value: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
const formatQuantity = (value: number) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 8 }).format(value);

export function TransactionHistoryDialog({ isOpen, onOpenChange, investment, onTransactionAdded, initialView = 'list' }: TransactionHistoryDialogProps) {
    const { user } = useAuth();
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState<'list' | 'form'>(initialView);
    const [editingTransaction, setEditingTransaction] = useState<Transaction | undefined>();
    const [deletingTransactionId, setDeletingTransactionId] = useState<string | null>(null);

    const fetchTransactions = useCallback(async () => {
        if (!user || !investment) return;
        setLoading(true);
        const fetchedTransactions = await getTransactions(user.uid, investment.id);
        setTransactions(fetchedTransactions);
        setLoading(false);
    }, [user, investment]);

    useEffect(() => {
        if (isOpen) {
            setView(initialView);
            setEditingTransaction(undefined);
        }
    }, [isOpen, initialView]);

    useEffect(() => {
        if (isOpen) {
            fetchTransactions();
        }
    }, [isOpen, fetchTransactions]);

    const handleFormSubmit = () => {
        setView('list');
        setEditingTransaction(undefined);
        onTransactionAdded(); 
    }

    const handleAddClick = () => {
        setEditingTransaction(undefined);
        setView('form');
    }

    const handleEditClick = (tx: Transaction) => {
        setEditingTransaction(tx);
        setView('form');
    };

    const handleDeleteClick = (txId: string) => {
        setDeletingTransactionId(txId);
    };

    const confirmDelete = async () => {
        if (!user || !deletingTransactionId) return;
        try {
            await deleteTransaction(user.uid, investment.id, deletingTransactionId);
            await fetchTransactions();
            onTransactionAdded(); // Refetch
            setDeletingTransactionId(null);
        } catch (error) {
            console.error("Failed to delete transaction:", error);
        }
    };

    const isIA = investment.type === 'Interest Account';

    const allTransactionsForDisplay: (Transaction & { isInitial?: boolean })[] = [
        ...transactions,
    ].sort((a, b) => +new Date(b.date) - +new Date(a.date));

    // Determine widths based on current view
    const widthClass = view === 'list' ? 'max-w-4xl' : 'max-w-lg';

    return (
        <>
            <Dialog open={isOpen} onOpenChange={onOpenChange}>
                {/* Consistent Dialog Structure:
                    1. w-[96vw] + max-w + p-0
                    2. Fixed Header (shrink-0)
                    3. Scrollable Body (flex-1)
                    4. Fixed Footer (shrink-0)
                */}
                <DialogContent className={cn("w-[96vw] p-0 flex flex-col max-h-[85vh]", widthClass)}>
                    
                    {/* Fixed Header */}
                    <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
                        <DialogTitle className="flex items-center gap-2">
                            {view === 'form' && (
                                <Button variant="ghost" size="icon" className="h-8 w-8 -ml-2 mr-1" onClick={() => { setView('list'); setEditingTransaction(undefined); }}>
                                    <ArrowLeft className="h-4 w-4" />
                                </Button>
                            )}
                            {view === 'form'
                                ? editingTransaction ? 'Edit Transaction' : 'Add Transaction'
                                : `History: ${investment.name}`}
                        </DialogTitle>
                        <DialogDescription>
                            {view === 'form'
                                ? isIA ? 'Record a deposit or withdrawal.' : 'Record a sale or income.'
                                : 'View past transactions for this investment.'}
                        </DialogDescription>
                    </DialogHeader>

                    {/* Scrollable Body */}
                    <div className="flex-1 overflow-y-auto px-6 py-4">
                        {view === 'form' ? (
                            <TransactionForm
                                investment={investment}
                                onFormSubmit={handleFormSubmit}
                                onCancel={() => { setView('list'); setEditingTransaction(undefined); }}
                                editingTransaction={editingTransaction}
                            />
                        ) : (
                            <div className="border rounded-md">
                                {loading ? (
                                    <div className="flex justify-center items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                                ) : (
                                    <Table>
                                        <TableHeader className="bg-muted/50">
                                            <TableRow className="hover:bg-transparent">
                                                <TableHead>Type</TableHead>
                                                <TableHead>Date</TableHead>
                                                <TableHead className="text-right">{isIA ? 'Amount' : 'Qty'}</TableHead>
                                                {!isIA && <TableHead className="text-right">Price</TableHead>}
                                                {!isIA && <TableHead className="text-right">Total</TableHead>}
                                                <TableHead className="w-[50px]"></TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {/* Initial Buy Row */}
                                            {investment.type !== 'Interest Account' && (
                                                <TableRow className="bg-muted/20 hover:bg-muted/40">
                                                    <TableCell><span className="font-medium text-green-600">Buy</span></TableCell>
                                                    <TableCell className="text-muted-foreground">{format(parseISO(investment.purchaseDate), 'dd MMM yyyy')}</TableCell>
                                                    <TableCell className="text-right font-mono text-muted-foreground">{formatQuantity(investment.purchaseQuantity)}</TableCell>
                                                    <TableCell className="text-right font-mono text-muted-foreground">{formatCurrency(investment.purchasePricePerUnit)}</TableCell>
                                                    <TableCell className="text-right font-mono text-muted-foreground">{formatCurrency(investment.purchaseQuantity * investment.purchasePricePerUnit)}</TableCell>
                                                    <TableCell></TableCell>
                                                </TableRow>
                                            )}

                                            {/* Transactions */}
                                            {allTransactionsForDisplay.map((tx) => (
                                                <TableRow key={tx.id}>
                                                    <TableCell>
                                                        <span className={cn(
                                                            'font-medium inline-flex items-center',
                                                            tx.type === 'Sell' && 'text-red-500',
                                                            tx.type === 'Dividend' && 'text-blue-500',
                                                            tx.type === 'Interest' && 'text-purple-500',
                                                            tx.type === 'Deposit' && 'text-green-600',
                                                            tx.type === 'Withdrawal' && 'text-orange-500',
                                                        )}>
                                                            {tx.type}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell>{format(parseISO(tx.date), 'dd MMM yyyy')}</TableCell>
                                                    <TableCell className="text-right font-mono">
                                                        {tx.type === 'Sell' ? formatQuantity(tx.quantity) : isIA ? formatCurrency(tx.totalAmount) : '—'}
                                                    </TableCell>
                                                    {!isIA && <TableCell className="text-right font-mono text-muted-foreground">{tx.type === 'Sell' ? formatCurrency(tx.pricePerUnit) : '—'}</TableCell>}
                                                    {!isIA && <TableCell className="text-right font-mono">{formatCurrency(tx.totalAmount)}</TableCell>}
                                                    <TableCell className="text-right">
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted">
                                                                    <MoreVertical className="h-4 w-4" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end">
                                                                <DropdownMenuItem onClick={() => handleEditClick(tx)}>
                                                                    <Edit className="mr-2 h-4 w-4" />
                                                                    Edit
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem onClick={() => handleDeleteClick(tx.id)} className="text-destructive focus:text-destructive">
                                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                                    Delete
                                                                </DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            {allTransactionsForDisplay.length === 0 && (
                                                <TableRow>
                                                    <TableCell colSpan={isIA ? 4 : 6} className="h-24 text-center text-muted-foreground">
                                                        No additional transactions found.
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Fixed Footer */}
                    <DialogFooter className="px-6 py-4 bg-background/50 backdrop-blur border-t shrink-0">
                         {view === 'form' ? (
                             <>
                                <Button type="button" variant="ghost" onClick={() => { setView('list'); setEditingTransaction(undefined); }}>Cancel</Button>
                                <Button type="submit" form="transaction-form">
                                    {editingTransaction ? 'Update Transaction' : 'Save Transaction'}
                                </Button>
                             </>
                         ) : (
                             <Button onClick={handleAddClick} className="w-full sm:w-auto">
                                <PlusCircle className="mr-2 h-4 w-4" />
                                Add Transaction
                             </Button>
                         )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!deletingTransactionId} onOpenChange={(open) => !open && setDeletingTransactionId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Transaction?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently remove this record from your history. This action cannot be undone.
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
"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { processFifoSell } from "@/lib/firestore";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import AppDatePicker from "./ui/app-date-picker";
import { Loader2 } from "lucide-react";

// Simplified schema for just selling
const fifoSellSchema = z.object({
  date: z.date(),
  quantity: z.number().positive("Quantity must be greater than 0"),
  pricePerUnit: z.number().nonnegative("Price cannot be negative"),
});

type FifoSellValues = z.infer<typeof fifoSellSchema>;

interface FifoSellDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  symbol: string | null;
  onSuccess: () => void;
}

export function FifoSellDialog({ isOpen, onOpenChange, symbol, onSuccess }: FifoSellDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FifoSellValues>({
    resolver: zodResolver(fifoSellSchema),
    defaultValues: {
      date: new Date(),
      quantity: 0,
      pricePerUnit: 0,
    },
  });

  const handleSubmit = async (values: FifoSellValues) => {
    if (!user || !symbol) return;
    setIsSubmitting(true);
    try {
      await processFifoSell(user.uid, symbol, values);
      toast({ title: "Success", description: `Sold ${values.quantity} units of ${symbol} (FIFO).` });
      form.reset();
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast({ 
        title: "Error", 
        description: error instanceof Error ? error.message : "Failed to process sell.", 
        variant: "destructive" 
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Sell {symbol} (FIFO)</DialogTitle>
          <DialogDescription>
            This will automatically sell your oldest holdings first to comply with German tax rules.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormItem>
                 <FormLabel>Date</FormLabel>
                 <Controller
                    control={form.control}
                    name="date"
                    render={({ field }) => (
                        <AppDatePicker
                            value={field.value ?? null}
                            onChange={field.onChange}
                            maxDate={new Date()}
                        />
                    )}
                />
              </FormItem>
              <div></div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantity</FormLabel>
                      <FormControl>
                        <Input 
                            type="number" step="any" 
                            {...field} 
                            onChange={e => field.onChange(parseFloat(e.target.value) || 0)} 
                        />
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
                        <Input 
                            type="number" step="any" 
                            {...field} 
                            onChange={e => field.onChange(parseFloat(e.target.value) || 0)} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sell Investment
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

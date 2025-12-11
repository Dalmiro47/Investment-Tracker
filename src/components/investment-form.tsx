"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm, useWatch } from "react-hook-form"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Investment, InvestmentFormValues, investmentSchema, InvestmentType } from "@/lib/types"
import React, { useEffect, useState } from "react"
import { Checkbox } from "./ui/checkbox"
import { Label } from "./ui/label"
import AppDatePicker from '@/components/ui/app-date-picker';
import { NumericInput } from "./ui/numeric-input"

interface InvestmentFormProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (
    values: InvestmentFormValues,
    startingBalance?: number,
    initialRatePct?: number
  ) => Promise<void> | void;
  investment?: Investment;
  initialType?: InvestmentType;
}

const defaultFormValues: InvestmentFormValues = {
  name: "",
  type: "Stock",
  purchaseDate: new Date(),
  purchaseQuantity: undefined as any,
  purchasePricePerUnit: undefined as any,
  ticker: "",
  stakingOrLending: false,
};

export function InvestmentForm({ isOpen, onOpenChange, onSubmit, investment, initialType }: InvestmentFormProps) {
  const form = useForm<InvestmentFormValues>({
    resolver: zodResolver(investmentSchema),
    defaultValues: defaultFormValues,
  })

  const [startingBalance, setStartingBalance] = useState<number | null>(null);
  const [initialRatePct, setInitialRatePct] = useState<number | null>(null);
  
  const watchedType = useWatch({ control: form.control, name: "type" });
  const isIA = watchedType === 'Interest Account';
  const isEditing = !!investment;

  // Create a stable "today" reference to pass to maxDate
  const today = new Date();

  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
        setStartingBalance(null);
        setInitialRatePct(null);
        const valuesToReset = investment 
            ? {
                ...investment,
                purchaseDate: new Date(investment.purchaseDate),
                ticker: investment.ticker ?? "",
                stakingOrLending: investment.stakingOrLending ?? false,
              }
            : {
                ...defaultFormValues,
                purchaseDate: new Date(),
                type: initialType ?? defaultFormValues.type,
              };

        form.reset(valuesToReset);
        
        // If creating a new (non-Interest Account) investment, clear numeric fields
        const addingNew = !investment;
        const type = (valuesToReset.type ?? initialType);
        if (addingNew && type !== 'Interest Account') {
            form.setValue('purchaseQuantity', undefined as any, { shouldDirty: false });
            form.setValue('purchasePricePerUnit', undefined as any, { shouldDirty: false });
        }
    }
  }, [investment, form, isOpen, initialType]);

  const handleFormSubmit = async (values: InvestmentFormValues) => {
      if (isIA) {
          values.purchaseQuantity = 0;
          values.purchasePricePerUnit = 0;
      }
      await Promise.resolve(
        onSubmit(
          values,
          !isEditing && isIA ? (startingBalance ?? 0) : undefined,
          !isEditing && isIA ? (initialRatePct ?? 0) : undefined
        )
      );
  };

  const isSubmitting = form.formState.isSubmitting;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent 
        className="w-[96vw] max-w-lg p-0 flex flex-col max-h-[85vh]"
        onCloseAutoFocus={(e) => {
            e.preventDefault();
            document.body.focus();
        }}
      >
        {/* Fixed Header */}
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle>{investment ? 'Edit Investment' : 'Add Investment'}</DialogTitle>
          <DialogDescription>
            {investment ? 'Update the details of your investment.' : 'Enter the details of your new investment below.'}
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <Form {...form}>
            <form id="investment-form" onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4">
              
              {/* Row 1: Name */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Account / Asset Name</FormLabel>
                    <FormControl>
                        <Input placeholder={isIA ? "e.g. High Yield Savings" : "e.g. TechCorp Inc."} {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
              />
              
              {/* Row 2: Type & Ticker */}
              <div className="grid grid-cols-2 gap-4">
                  <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                      <FormItem>
                      <FormLabel>Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                          <SelectTrigger>
                              <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                          <SelectItem value="Stock">Stock</SelectItem>
                          <SelectItem value="ETF">ETF</SelectItem>
                          <SelectItem value="Crypto">Crypto</SelectItem>
                          <SelectItem value="Bond">Bond</SelectItem>
                          <SelectItem value="Interest Account">Interest Account</SelectItem>
                          <SelectItem value="Real Estate">Real Estate</SelectItem>
                          </SelectContent>
                      </Select>
                      <FormMessage />
                      </FormItem>
                  )}
                  />

                  {!isIA && (
                      <FormField
                      control={form.control}
                      name="ticker"
                      render={({ field }) => (
                          <FormItem>
                          <FormLabel>Ticker / Symbol</FormLabel>
                          <FormControl>
                              <Input placeholder={
                              watchedType === 'Crypto' ? "e.g. bitcoin (id)" : "e.g. NVD.F"
                              } {...field} />
                          </FormControl>
                          <FormMessage />
                          </FormItem>
                      )}
                      />
                  )}
              </div>

              {/* Row 3: Date & Quantity */}
              <div className="grid grid-cols-2 gap-4">
                  <FormItem>
                      <FormLabel>{isIA ? "Opening Date" : "Purchase Date"}</FormLabel>
                      <Controller
                          control={form.control}
                          name="purchaseDate"
                          render={({ field }) => (
                          <AppDatePicker
                              value={field.value ?? null}
                              onChange={(d) => field.onChange(d)}
                              placeholder="dd/mm/yyyy"
                              maxDate={today}
                          />
                          )}
                      />
                      <FormMessage />
                  </FormItem>

                  {!isIA && (
                      <FormField
                      control={form.control}
                      name="purchaseQuantity"
                      render={({ field }) => (
                          <FormItem>
                          <FormLabel>Quantity</FormLabel>
                          <FormControl>
                              <NumericInput
                              value={field.value as number | null | undefined}
                              onCommit={(n) => field.onChange(n ?? undefined)}
                              placeholder="e.g. 0.12"
                              allowDecimal={true}
                              />
                          </FormControl>
                          <FormMessage />
                          </FormItem>
                      )}
                      />
                  )}
              </div>

              {/* IA Specific Fields */}
              {isIA && !isEditing && (
                  <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                          <Label>Starting Balance</Label>
                          <NumericInput
                              value={startingBalance}
                              onCommit={(n) => setStartingBalance(n ?? null)}
                              placeholder="e.g. 3,000.00"
                              allowDecimal
                          />
                      </div>
                      <div className="space-y-2">
                          <Label>Initial Rate (%)</Label>
                          <NumericInput
                              value={initialRatePct}
                              onCommit={(n) => setInitialRatePct(n ?? null)}
                              placeholder="e.g. 3.5"
                              allowDecimal
                          />
                      </div>
                  </div>
              )}

              {/* Price Row */}
              {!isIA && (
                   <FormField
                   control={form.control}
                   name="purchasePricePerUnit"
                   render={({ field }) => (
                       <FormItem>
                       <FormLabel>Purchase Price (per unit)</FormLabel>
                       <FormControl>
                           <NumericInput
                           value={field.value as number | null | undefined}
                           onCommit={(n) => field.onChange(n ?? undefined)}
                           placeholder="e.g. 150.50"
                           allowDecimal={true}
                           />
                       </FormControl>
                       <FormMessage />
                       </FormItem>
                   )}
                   />
              )}

              {watchedType === 'Crypto' && (
                  <FormField
                  control={form.control}
                  name="stakingOrLending"
                  render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-3">
                          <FormControl>
                              <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                               <FormLabel>Used for Staking/Lending?</FormLabel>
                               <FormDescription className="text-xs">Extends tax-free holding to 10 years (DE).</FormDescription>
                          </div>
                      </FormItem>
                  )}
                  />
              )}
            </form>
          </Form>
        </div>

        {/* Fixed Footer */}
        <DialogFooter className="px-6 py-4 bg-background/50 backdrop-blur border-t shrink-0">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
          {/* Connect button to form via ID */}
          <Button type="submit" form="investment-form" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : (investment ? 'Update Investment' : 'Save Investment')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

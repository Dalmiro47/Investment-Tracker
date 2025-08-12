
"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useForm, useWatch } from "react-hook-form"
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
} from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { Investment, InvestmentFormValues, investmentSchema, InvestmentType } from "@/lib/types"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { CalendarIcon } from "lucide-react"
import { format } from "date-fns"

interface InvestmentFormProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: InvestmentFormValues) => void;
  investment?: Investment;
}

const defaultFormValues: InvestmentFormValues = {
  name: "",
  type: "Stock",
  purchaseDate: new Date(),
  purchaseQuantity: 0,
  purchasePricePerUnit: 0,
  ticker: "",
};


export function InvestmentForm({ isOpen, onOpenChange, onSubmit, investment }: InvestmentFormProps) {
  const form = useForm<InvestmentFormValues>({
    resolver: zodResolver(investmentSchema),
    defaultValues: defaultFormValues,
  })

  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  
  const watchedType = useWatch({
    control: form.control,
    name: "type",
  });

  useEffect(() => {
    if (isOpen) {
        const valuesToReset = investment 
            ? {
                ...investment,
                purchaseDate: new Date(investment.purchaseDate),
                ticker: investment.ticker ?? "",
              }
            : { ...defaultFormValues, purchaseDate: new Date() };

        form.reset(valuesToReset);
    }
  }, [investment, form, isOpen]);

  const isSubmitting = form.formState.isSubmitting;
  const isTickerRequired = ['Stock', 'ETF', 'Crypto'].includes(watchedType);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{investment ? 'Edit' : 'Add'} Investment</DialogTitle>
          <DialogDescription>
            {investment ? 'Update the details of your investment.' : 'Enter the details of your new investment.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>Investment Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. TechCorp Inc." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select an investment type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Stock">Stock</SelectItem>
                      <SelectItem value="ETF">ETF</SelectItem>
                      <SelectItem value="Crypto">Crypto</SelectItem>
                      <SelectItem value="Bond">Bond</SelectItem>
                      <SelectItem value="Savings">Savings</SelectItem>
                      <SelectItem value="Real Estate">Real Estate</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="ticker"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ticker / Symbol</FormLabel>
                  <FormControl>
                    <Input placeholder={
                      watchedType === 'Crypto' ? "e.g. bitcoin (coingecko id)" : "e.g. NVD.F (for Frankfurt)"
                    } {...field} />
                  </FormControl>
                  <FormDescription>
                    {isTickerRequired ? "Required for automatic price updates." : "Optional."}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

             <FormField
              control={form.control}
              name="purchaseDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Purchase Date</FormLabel>
                   <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={"outline"}
                          className={cn(
                            "w-full pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value ? (
                            format(field.value, "PPP")
                          ) : (
                            <span>Pick a date</span>
                          )}
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
                        disabled={(date) =>
                          date > new Date() || date < new Date("1900-01-01")
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="purchaseQuantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Purchase Quantity</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="e.g. 50" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} />
                  </FormControl>
                   <FormDescription>
                    This is a one-time entry. Sells are added later.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="purchasePricePerUnit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Purchase Price (per unit)</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="e.g. 150.00" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="md:col-span-2 flex justify-end gap-2 pt-4">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save Investment'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

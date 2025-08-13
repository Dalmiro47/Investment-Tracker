
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
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
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { CalendarIcon, PlusCircle, Trash2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import type { ETFPlan, ETFComponent } from "@/lib/types.etf";
import { useEffect, useMemo } from "react";
import { defaultTickerForISIN } from "@/lib/providers/yahoo";

const planSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters."),
  startDate: z.date(),
  monthContribution: z.coerce.number().positive("Contribution must be positive."),
  feePct: z.coerce.number().min(0).max(1).optional(),
  rebalanceOnContribution: z.boolean().default(false),
  components: z.array(z.object({
    id: z.string().optional(),
    name: z.string().min(2, "Name is required."),
    isin: z.string().regex(/^[A-Z]{2}[A-Z0-9]{9}\d$/, "Invalid ISIN format."),
    preferredExchange: z.enum(['XETRA', 'LSE', 'MIL', 'AMS']).optional(),
    ticker: z.string().optional(),
    targetWeight: z.coerce.number().min(0).max(1, "Weight must be between 0 and 1."),
  })).min(1, "At least one component is required.")
    .refine(components => {
        const totalWeight = components.reduce((sum, c) => sum + (c.targetWeight || 0), 0);
        // Use a small tolerance for floating point comparisons
        return Math.abs(totalWeight - 1) < 1e-9;
    }, {
        message: "Total target weight must be exactly 100%.",
        path: ["components"],
    })
    .refine(cs => {
      const keys = cs.map(c => (c.ticker || c.isin).trim().toUpperCase()).filter(k => k);
      return new Set(keys).size === keys.length;
    }, { path: ['components'], message: 'Duplicate tickers/ISINs are not allowed.' })
});

export type PlanFormValues = z.infer<typeof planSchema>;

interface PlanFormProps {
  plan?: ETFPlan & { components: ETFComponent[] };
  onSubmit: (values: PlanFormValues) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function PlanForm({ plan, onSubmit, onCancel, isSubmitting }: PlanFormProps) {
  const form = useForm<PlanFormValues>({
    resolver: zodResolver(planSchema),
    defaultValues: {
      title: "",
      startDate: new Date(),
      monthContribution: 100,
      feePct: 0,
      rebalanceOnContribution: false,
      components: [
        { name: "", isin: "", preferredExchange: "XETRA", targetWeight: undefined as any },
      ],
    }
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "components",
  });
  
  const componentValues = form.watch('components');
  const totalWeight = useMemo(() => {
    return componentValues.reduce((sum, c) => sum + (Number(c.targetWeight) || 0), 0);
  }, [componentValues]);

  const isSaveDisabled = isSubmitting || Math.abs(totalWeight - 1) > 1e-9;

  useEffect(() => {
    if (plan) {
      form.reset({
        ...plan,
        startDate: parseISO(plan.startDate),
        components: plan.components.map(c => ({...c}))
      });
    }
  }, [plan, form]);


  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Plan Title</FormLabel>
                <FormControl><Input {...field} placeholder="e.g., Core Portfolio" /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
           <FormField
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Start Date</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant={"outline"}
                        className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                      >
                        {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={(date) => date > new Date()} initialFocus />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="monthContribution"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Monthly Contribution (€)</FormLabel>
                <FormControl><Input type="number" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="feePct"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fee per Contribution (%)</FormLabel>
                <FormControl><Input type="number" step="0.01" {...field} onChange={e => field.onChange(parseFloat(e.target.value) / 100)} value={(field.value ?? 0) * 100} /></FormControl>
                <FormDescription>e.g., 0.1 for 0.1%</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="rebalanceOnContribution"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 mt-auto">
                <div className="space-y-0.5">
                  <FormLabel>Rebalance on Contribution</FormLabel>
                   <FormDescription>Use monthly cash to buy under-weight assets.</FormDescription>
                </div>
                <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
              </FormItem>
            )}
          />
        </div>

        <div>
          <h3 className="text-lg font-medium">Components</h3>
          <div className="mt-2 rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[25%]">Name</TableHead>
                  <TableHead className="w-[20%]">ISIN</TableHead>
                  <TableHead className="w-[15%]">Exchange</TableHead>
                  <TableHead className="w-[20%]">Ticker (Override)</TableHead>
                  <TableHead className="text-right w-[120px]">Weight (%)</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fields.map((field, index) => (
                  <TableRow key={field.id} className="align-top">
                    <TableCell>
                      <Controller
                        control={form.control}
                        name={`components.${index}.name`}
                        render={({ field }) => <Input {...field} placeholder="MSCI World" />}
                      />
                    </TableCell>
                    <TableCell>
                       <Controller
                        control={form.control}
                        name={`components.${index}.isin`}
                        render={({ field }) => <Input {...field} placeholder="IE00B4L5Y983"/>}
                      />
                    </TableCell>
                     <TableCell>
                      <Controller
                          control={form.control}
                          name={`components.${index}.preferredExchange`}
                          render={({ field }) => (
                             <Select onValueChange={field.onChange} value={field.value}>
                                <SelectTrigger><SelectValue placeholder="Exchange"/></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="LSE">LSE</SelectItem>
                                    <SelectItem value="XETRA">XETRA</SelectItem>
                                    <SelectItem value="AMS">AMS</SelectItem>
                                    <SelectItem value="MIL">MIL</SelectItem>
                                </SelectContent>
                            </Select>
                          )}
                        />
                    </TableCell>
                    <TableCell>
                       <div className="flex flex-col">
                           <Controller
                            control={form.control}
                            name={`components.${index}.ticker`}
                            render={({ field }) => (
                                <Input {...field} placeholder="Optional override" />
                            )}
                          />
                            <FormDescription className="text-xs mt-1">
                                Using: {form.watch(`components.${index}.ticker`) || defaultTickerForISIN(form.watch(`components.${index}.isin`), form.watch(`components.${index}.preferredExchange`)) || 'N/A'}
                            </FormDescription>
                        </div>
                    </TableCell>
                    <TableCell>
                        <Controller
                            control={form.control}
                            name={`components.${index}.targetWeight`}
                            render={({ field }) => (
                                <Input 
                                    type="number" 
                                    step="0.01"
                                    className="text-right" 
                                    onChange={e => {
                                        const value = e.target.value;
                                        // Regex to allow numbers with up to 2 decimal places
                                        const regex = /^\d*(\.\d{0,2})?$/;
                                        if (value === "" || value === null) {
                                            field.onChange(null);
                                        } else if (regex.test(value)) {
                                            const parsedValue = parseFloat(value);
                                            if (!isNaN(parsedValue)) {
                                                field.onChange(parsedValue / 100);
                                            }
                                        }
                                    }} 
                                    value={field.value === null || field.value === undefined ? '' : field.value * 100} 
                                    placeholder="Weight"
                                />
                            )}
                        />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => remove(index)} disabled={fields.length <= 1}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
           <div className="flex justify-between items-center mt-2">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => append({ name: "", isin: "", targetWeight: undefined as any, preferredExchange: "XETRA" })}
                >
                    <PlusCircle className="mr-2 h-4 w-4" /> Add Component
                </Button>
                <div className={cn("text-sm font-medium", Math.abs(totalWeight - 1) > 1e-9 ? "text-destructive" : "text-green-600")}>
                    Total Weight: {(totalWeight * 100).toFixed(2)}%
                </div>
            </div>
             {form.formState.errors.components?.message && (
                <p className="text-sm font-medium text-destructive mt-2">{form.formState.errors.components.message}</p>
            )}
             {form.formState.errors.components?.root?.message && (
                <p className="text-sm font-medium text-destructive mt-2">{form.formState.errors.components?.root?.message}</p>
            )}
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button type="submit" disabled={isSaveDisabled}>{isSubmitting ? "Saving..." : "Save Plan"}</Button>
        </div>
      </form>
    </Form>
  );
}

    

    

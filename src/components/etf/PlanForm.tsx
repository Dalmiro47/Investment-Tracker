
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
import React, { useEffect, useMemo } from "react";
import { defaultTickerForISIN } from "@/lib/providers/yahoo";

function PercentInput({
  value,            // 0..1 | null
  onChange,         // (unit: number|null) => void
  placeholder,
  className,
}: {
  value: number | null | undefined;
  onChange: (unit: number | null) => void;
  placeholder?: string;
  className?: string;
}) {
  const [text, setText] = React.useState<string>(value == null ? "" : (value * 100).toFixed(2));

  // keep local text in sync when RHF resets/loads from external source, but not on own changes
  useEffect(() => {
    const currentValue = value == null ? null : (value * 100);
    const textAsNumber = text === "" ? null : Number(text.replace(",", "."));

    if (currentValue !== textAsNumber) {
       setText(value == null ? "" : (value * 100).toFixed(2));
    }
  }, [value]);

  // allow: "", "7", "7.", "7.1", "7.12" (up to 2 decimals), max 100
  const re = /^\d{0,3}(\.\d{0,2})?$/;

  return (
    <Input
      inputMode="decimal"
      className={className}
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        const raw = e.target.value.replace(",", ".");
        if (raw === "") {
          setText("");
          onChange(null);
          return;
        }
        if (!re.test(raw)) return;                // refuse invalid keystrokes
        // show the raw text while typing
        setText(raw);
        const n = Number(raw);
        if (!Number.isFinite(n)) return;
        const clamped = Math.max(0, Math.min(100, n));
        onChange(clamped / 100);
      }}
      onBlur={() => {
        // normalize to two decimals on blur
        if (text === "") return;
        const n = Number(text);
        const clamped = Math.max(0, Math.min(100, n));
        const norm = clamped.toFixed(2);
        setText(norm);
        onChange(clamped / 100);
      }}
    />
  );
}


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
    targetWeight: z.coerce.number().min(0).max(1, "Weight must be between 0 and 1.").nullable(),
  })).min(1, "At least one component is required.")
    .refine(components => {
        const totalWeight = components.reduce((sum, c) => sum + (c.targetWeight || 0), 0);
        // Use a small tolerance for floating point comparisons
        return Math.abs(totalWeight - 1) < 0.001;
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
        { name: "", isin: "", preferredExchange: "XETRA", targetWeight: null },
      ],
    }
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "components",
  });
  
  const componentValues = form.watch('components');
  
  const { totalWeight, hasUnresolvedTickers } = useMemo(() => {
    const weight = componentValues.reduce((sum, c) => sum + (Number(c.targetWeight) || 0), 0);
    const unresolved = componentValues.some(c => !(c.ticker?.trim() || defaultTickerForISIN(c.isin, c.preferredExchange)));
    return { totalWeight: weight, hasUnresolvedTickers: unresolved };
  }, [componentValues]);


  const isSaveDisabled = isSubmitting || Math.abs(totalWeight - 1) > 0.001 || hasUnresolvedTickers;

  useEffect(() => {
    if (plan) {
      form.reset({
        ...plan,
        startDate: parseISO(plan.startDate),
        components: plan.components.map(c => ({...c, targetWeight: c.targetWeight ?? null}))
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
                {fields.map((field, index) => {
                  return (
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
                    <TableCell className="align-top">
                      <div className="flex flex-col gap-1">
                        <Controller
                          control={form.control}
                          name={`components.${index}.ticker`}
                          render={({ field }) => (
                            <Input {...field} placeholder="Optional override (e.g. EUNL.DE or SWDA.L)" />
                          )}
                        />
                        {(() => {
                          const exch = form.watch(`components.${index}.preferredExchange`);
                          const isin = form.watch(`components.${index}.isin`);
                          const override = form.watch(`components.${index}.ticker`)?.trim();
                          const resolved = override || defaultTickerForISIN(isin, exch);
                          const unresolved = !resolved;

                          return (
                            <div className="min-h-[20px] text-xs">
                              {unresolved ? (
                                <span className="text-destructive">
                                  No known ticker for this ISIN + exchange. Enter an override.
                                </span>
                              ) : (
                                <span className="text-muted-foreground">
                                  Using:&nbsp;
                                  <span className="inline-flex items-center rounded border px-2 py-0.5">
                                    {override ? "Override: " : ""}
                                    {resolved}
                                  </span>
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <Controller
                        control={form.control}
                        name={`components.${index}.targetWeight`}
                        render={({ field }) => (
                          <PercentInput
                            value={field.value}
                            onChange={(unit) => field.onChange(unit)}
                            placeholder="Weight"
                            className="text-right"
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
                )})}
              </TableBody>
            </Table>
          </div>
           <div className="flex justify-between items-center mt-2">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => append({ name: "", isin: "", targetWeight: null, preferredExchange: "XETRA" })}
                >
                    <PlusCircle className="mr-2 h-4 w-4" /> Add Component
                </Button>
                <div className={cn("text-sm font-medium", Math.abs(totalWeight - 1) > 0.001 ? "text-destructive" : "text-green-600")}>
                    Total Weight: {(Number((totalWeight * 100).toFixed(2))).toFixed(2)}%
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


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
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { PlusCircle, Trash2 } from "lucide-react";
import type { ETFPlan, ETFComponent, AdminFee, FrontloadFee } from "@/lib/types.etf";
import React, { useEffect, useMemo } from "react";
import AppDatePicker from "../ui/app-date-picker";
import { parseISO } from 'date-fns';
import { NumericInput } from "../ui/numeric-input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";


const planSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters."),
  startDate: z.date(),
  monthContribution: z.coerce.number().positive("Contribution must be positive."),
  feePct: z.coerce.number().min(0).max(1).optional().nullable(),
  rebalanceOnContribution: z.boolean().default(false),
  contributionSteps: z.array(z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/, "Format must be YYYY-MM"),
      amount: z.coerce.number().positive("Amount must be positive.")
  })).optional(),
  frontloadFee: z.object({
    percentOfContribution: z.coerce.number().min(0).max(1).optional().nullable(),
    fixedPerMonthEUR: z.coerce.number().min(0).optional().nullable(),
    durationMonths: z.coerce.number().int().min(0).optional().nullable(),
  }).optional().nullable(),
  adminFee: z.object({
    annualPercent: z.coerce.number().min(0).max(1).optional().nullable(),
    fixedPerMonthEUR: z.coerce.number().min(0).optional().nullable(),
    applyProRataMonthly: z.boolean().optional(),
  }).optional().nullable(),
  components: z.array(z.object({
    id: z.string().optional(),
    name: z.string().min(2, "Name is required."),
    isin: z.string().optional(),
    preferredExchange: z.enum(['XETRA', 'LSE', 'MIL', 'AMS']).optional(),
    ticker: z.string().min(1, 'A Yahoo Finance ticker is required.'),
    targetWeight: z.coerce.number().min(0).max(1, "Weight must be between 0 and 1.").nullable(),
  })).min(1, "At least one component is required.")
    .refine(components => {
        const totalWeight = components.reduce((sum, c) => sum + (c.targetWeight || 0), 0);
        return Math.abs(totalWeight - 1) < 0.001;
    }, {
        message: "Total target weight must be exactly 100%.",
        path: ["components"],
    })
    .refine(cs => {
      const keys = cs.map(c => c.ticker?.trim().toUpperCase()).filter(k => k);
      return new Set(keys).size === keys.length;
    }, { path: ['components'], message: 'Duplicate tickers are not allowed.' })
});

export type PlanFormValues = z.infer<typeof planSchema>;

interface PlanFormProps {
  plan?: ETFPlan & { components: ETFComponent[] };
  onSubmit: (values: PlanFormValues) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  formId?: string;
  useExternalFooter?: boolean;
}

export function PlanForm({
  plan,
  onSubmit,
  onCancel,
  isSubmitting,
  formId = "etf-plan-form",
  useExternalFooter = false,
}: PlanFormProps) {
  const form = useForm<PlanFormValues>({
    resolver: zodResolver(planSchema),
    defaultValues: {
      title: "",
      startDate: new Date(),
      monthContribution: undefined as any,
      feePct: undefined,
      rebalanceOnContribution: false,
      contributionSteps: [],
      frontloadFee: { percentOfContribution: null, fixedPerMonthEUR: null, durationMonths: null },
      adminFee: { annualPercent: null, fixedPerMonthEUR: null, applyProRataMonthly: true },
      components: [
        { name: "", isin: "", ticker: "", preferredExchange: "XETRA", targetWeight: null },
      ],
    }
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "components",
  });
  
  const { fields: stepFields, append: appendStep, remove: removeStep } = useFieldArray({
    control: form.control,
    name: "contributionSteps",
  });

  const componentValues = form.watch('components');
  
  const totalWeight = useMemo(() => {
    return componentValues.reduce((sum, c) => sum + (Number(c.targetWeight) || 0), 0);
  }, [componentValues]);


  const isSaveDisabled = isSubmitting || Math.abs(totalWeight - 1) > 0.001;

  useEffect(() => {
    if (plan) {
      form.reset({
        ...plan,
        startDate: parseISO(plan.startDate),
        feePct: plan.feePct ?? undefined,
        frontloadFee: plan.frontloadFee ?? { percentOfContribution: null, fixedPerMonthEUR: null, durationMonths: null },
        adminFee: plan.adminFee ?? { annualPercent: null, fixedPerMonthEUR: null, applyProRataMonthly: true },
        components: plan.components.map(c => ({...c, targetWeight: c.targetWeight ?? null}))
      });
    } else {
        form.reset({
            title: "",
            startDate: new Date(),
            monthContribution: undefined as any,
            feePct: undefined,
            rebalanceOnContribution: false,
            contributionSteps: [],
            frontloadFee: { percentOfContribution: null, fixedPerMonthEUR: null, durationMonths: null },
            adminFee: { annualPercent: null, fixedPerMonthEUR: null, applyProRataMonthly: true },
            components: [
                { name: "", isin: "", ticker: "", preferredExchange: "XETRA", targetWeight: null },
            ],
        });
    }
  }, [plan, form]);


  return (
    <Form {...form}>
      <form id={formId} onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
           <FormItem className="flex flex-col">
              <FormLabel>Start Date</FormLabel>
               <Controller
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <AppDatePicker
                    value={field.value ?? null}
                    onChange={field.onChange}
                    placeholder="dd/mm/yyyy"
                    maxDate={new Date()}
                  />
                )}
              />
              <FormMessage />
            </FormItem>
          <FormField
            control={form.control}
            name="monthContribution"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Base Monthly Contribution (€)</FormLabel>
                <FormControl>
                    <NumericInput
                        value={field.value}
                        onCommit={(n) => field.onChange(n ?? undefined)}
                        placeholder="e.g., 100"
                    />
                </FormControl>
                 <FormDescription>The starting amount. You can add step-ups below.</FormDescription>
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
        
        <div className="space-y-2">
            <h3 className="text-lg font-medium">Contribution Step-ups (Optional)</h3>
            <div className="rounded-md border">
                 <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[40%]">Effective Month (YYYY-MM)</TableHead>
                            <TableHead className="w-[40%]">New Monthly Amount (€)</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {stepFields.map((field, index) => (
                            <TableRow key={field.id} className="align-top">
                                <TableCell>
                                    <FormField control={form.control} name={`contributionSteps.${index}.month`}
                                        render={({ field }) => <Input {...field} placeholder="e.g. 2024-01" />}
                                    />
                                    <FormMessage className="text-xs mt-1">{form.formState.errors.contributionSteps?.[index]?.month?.message}</FormMessage>
                                </TableCell>
                                <TableCell>
                                    <FormField control={form.control} name={`contributionSteps.${index}.amount`}
                                        render={({ field }) => (
                                           <NumericInput
                                                value={field.value}
                                                onCommit={(n) => field.onChange(n ?? undefined)}
                                                placeholder="e.g. 200"
                                            />
                                        )}
                                    />
                                     <FormMessage className="text-xs mt-1">{form.formState.errors.contributionSteps?.[index]?.amount?.message}</FormMessage>
                                </TableCell>
                                <TableCell>
                                    <Button variant="ghost" size="icon" onClick={() => removeStep(index)}>
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                 </Table>
            </div>
             <Button
                type="button" variant="outline" size="sm"
                onClick={() => appendStep({ month: "", amount: undefined as any })}
            >
                <PlusCircle className="mr-2 h-4 w-4" /> Add Step-up
            </Button>
        </div>
        
        <div className="space-y-4">
            <h3 className="text-lg font-medium">Advanced Fees (Optional)</h3>
              <div className="p-4 border rounded-lg">
                <h4 className="font-medium mb-2">Legacy Fee (%)</h4>
                <FormField
                  control={form.control}
                  name="feePct"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fee per Contribution (%)</FormLabel>
                      <FormControl>
                        <NumericInput
                          value={field.value == null ? null : field.value * 100}
                          onCommit={(n) => field.onChange(n != null ? n / 100 : undefined)}
                          placeholder="e.g., 0.1 for 0.1%"
                        />
                      </FormControl>
                      <FormDescription>e.g., 0.1 for 0.1%</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="p-4 border rounded-lg space-y-4">
                <h4 className="font-medium">Front-load Fee (Agio)</h4>
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="frontloadFee.percentOfContribution" render={({ field }) => (
                    <FormItem><FormLabel>% of Contribution</FormLabel><FormControl><NumericInput value={field.value == null ? null : field.value * 100} onCommit={n => field.onChange(n != null ? n/100 : null)} /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name="frontloadFee.fixedPerMonthEUR" render={({ field }) => (
                    <FormItem><FormLabel>Fixed per Month (€)</FormLabel><FormControl><NumericInput value={field.value} onCommit={n => field.onChange(n)} /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name="frontloadFee.durationMonths" render={({ field }) => (
                    <FormItem><FormLabel>Duration (months)</FormLabel><FormControl><NumericInput value={field.value} onCommit={n => field.onChange(n)} allowDecimal={false} /></FormControl></FormItem>
                  )} />
                </div>
              </div>
               <div className="p-4 border rounded-lg space-y-4">
                <h4 className="font-medium">Admin Fee</h4>
                <div className="grid grid-cols-2 gap-4">
                   <FormField control={form.control} name="adminFee.annualPercent" render={({ field }) => (
                    <FormItem><FormLabel>Annual % of NAV</FormLabel><FormControl><NumericInput value={field.value == null ? null : field.value * 100} onCommit={n => field.onChange(n != null ? n/100 : null)} /></FormControl></FormItem>
                  )} />
                   <FormField control={form.control} name="adminFee.fixedPerMonthEUR" render={({ field }) => (
                    <FormItem><FormLabel>Fixed per Month (€)</FormLabel><FormControl><NumericInput value={field.value} onCommit={n => field.onChange(n)} /></FormControl></FormItem>
                  )} />
                </div>
              </div>
        </div>


        <div>
          <h3 className="text-lg font-medium">Components</h3>
          <div className="mt-2 rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[25%]">Name</TableHead>
                  <TableHead className="w-[20%]">Ticker (from Yahoo Finance)</TableHead>
                  <TableHead className="w-[20%]">ISIN (Optional)</TableHead>
                  <TableHead className="w-[15%]">Exchange (Optional)</TableHead>
                  <TableHead className="text-right w-[120px]">Weight (%)</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fields.map((field, index) => {
                  return (
                  <TableRow key={field.id} className="align-top">
                    <TableCell>
                      <FormField
                        control={form.control}
                        name={`components.${index}.name`}
                        render={({ field }) => <Input {...field} placeholder="MSCI World" />}
                      />
                       <FormMessage className="text-xs mt-1">{form.formState.errors.components?.[index]?.name?.message}</FormMessage>
                    </TableCell>
                     <TableCell>
                      <FormField
                        control={form.control}
                        name={`components.${index}.ticker`}
                        render={({ field }) => <Input {...field} placeholder="IWDA.AS" />}
                      />
                       <FormMessage className="text-xs mt-1">{form.formState.errors.components?.[index]?.ticker?.message}</FormMessage>
                    </TableCell>
                    <TableCell>
                       <FormField
                        control={form.control}
                        name={`components.${index}.isin`}
                        render={({ field }) => <Input {...field} placeholder="IE00B4L5Y983"/>}
                      />
                    </TableCell>
                     <TableCell>
                      <FormField
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
                      <FormField
                        control={form.control}
                        name={`components.${index}.targetWeight`}
                        render={({ field }) => (
                          <NumericInput
                            value={field.value === null ? null : (field.value ?? 0) * 100}
                            onCommit={(n) => field.onChange(n === null ? null : (n/100))}
                            placeholder="Weight"
                            className="text-right"
                          />
                        )}
                      />
                       <FormMessage className="text-xs mt-1">{form.formState.errors.components?.[index]?.targetWeight?.message}</FormMessage>
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
                    onClick={() => append({ name: "", isin: "", ticker: "", targetWeight: null, preferredExchange: "XETRA" })}
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

        {!useExternalFooter && (
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>Cancel</Button>
            <Button type="submit" disabled={isSaveDisabled}>{isSubmitting ? "Saving..." : "Save Plan"}</Button>
          </div>
        )}
      </form>
    </Form>
  );
}

    
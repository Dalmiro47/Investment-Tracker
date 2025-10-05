
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getEtfPlans, createEtfPlan, deleteEtfPlan, getEtfPlan, updateEtfPlan } from '@/lib/firestore.etfPlan';
import type { ETFPlan, ETFComponent } from '@/lib/types.etf';
import DashboardHeader from '@/components/dashboard-header';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreVertical, PlusCircle, Trash2, Edit, Loader2, BarChart2, Info } from 'lucide-react';
import { PlanForm, type PlanFormValues } from '@/components/etf/PlanForm';
import { format, parseISO } from 'date-fns';
import { formatCurrency } from '@/lib/money';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function PlanModal({
  open,
  onOpenChange,
  editingPlan,
  onSubmit,
  onCancel,
  isSubmitting,
  onOpenFeeHelp,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editingPlan?: ETFPlan | null;
  onSubmit: (p: any) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  onOpenFeeHelp: () => void;
}) {
  // Key forces React to remount when switching create/edit -> obliterates stale tree in Studio
  const dialogKey = editingPlan ? 'etf-dialog-edit-v5' : 'etf-dialog-create-v5';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        key={dialogKey}
        data-testid="etf-dialog-v5"
        className="max-w-4xl w-[96vw] p-0 grid grid-rows-[auto,1fr,auto] overflow-hidden"
        style={{ height: 'min(90dvh, 820px)' }}
      >
        {/* Header (fixed) */}
        <DialogHeader className="p-6 pb-2">
          <div className="flex items-center gap-2">
            <DialogTitle>{editingPlan ? 'Edit ETF Plan' : 'Create New ETF Plan'}</DialogTitle>
            <span className="text-xs text-muted-foreground">·v5</span>
          </div>
          <DialogDescription>
            {editingPlan
              ? 'Update your automated savings plan.'
              : 'Define your automated savings plan details and components.'}
          </DialogDescription>
        </DialogHeader>

        {/* Body (the ONLY scroller) */}
        <div
          data-testid="etf-dialog-body"
          className="
            min-h-0 px-6 pb-6 pr-3
            etf-dialog-scroll etf-dialog-scroll-v2 etf-dialog-scroll-v3 etf-dialog-scroll-v4 etf-dialog-scroll-v5
          "
          style={{
            overflowY: 'scroll',
            overscrollBehavior: 'contain',
            scrollbarGutter: 'stable',
          }}
        >
          <PlanForm
            formId="etf-plan-form"
            useExternalFooter
            plan={editingPlan ?? undefined}
            onSubmit={onSubmit}
            onCancel={onCancel}
            isSubmitting={isSubmitting}
            onOpenFeeHelp={onOpenFeeHelp}
          />
        </div>

        {/* Footer (fixed) */}
        <div className="px-6 py-4 border-t bg-background flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" form="etf-plan-form" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save Plan'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function getAdvancedFeeChips(plan: ETFPlan): string[] {
  const chips: string[] = [];
  const fmt = (n: number) =>
    n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });

  // Front-load (sales)
  const fl = plan.frontloadFee;
  if (fl && (fl.percentOfContribution != null || fl.fixedPerMonthEUR != null || fl.durationMonths != null)) {
    const parts: string[] = [];
    if (fl.percentOfContribution != null) parts.push(`${(fl.percentOfContribution * 100).toFixed(2)}% contrib`);
    if (fl.fixedPerMonthEUR != null) parts.push(`${fmt(fl.fixedPerMonthEUR)}/mo`);
    if (fl.durationMonths != null) parts.push(`${fl.durationMonths} mo`);
    chips.push(`Sales ${parts.join(' · ')}`);
  }

  // Admin
  const af = plan.adminFee;
  if (af && (af.annualPercent != null || af.fixedPerMonthEUR != null)) {
    const parts: string[] = [];
    if (af.annualPercent != null) parts.push(`${(af.annualPercent * 100).toFixed(2)}%/yr NAV`);
    if (af.fixedPerMonthEUR != null) parts.push(`${fmt(af.fixedPerMonthEUR)}/mo`);
    chips.push(`Admin ${parts.join(' · ')}`);
  }

  return chips;
}


export default function EtfPlansPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [plans, setPlans] = useState<ETFPlan[]>([]);
    const [loading, setLoading] = useState(true);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [editingPlan, setEditingPlan] = useState<(ETFPlan & { components: ETFComponent[] }) | null>(null);
    const [isInfoDialogOpen, setIsInfoDialogOpen] = useState(false);
    const [infoDialogPlan, setInfoDialogPlan] = useState<ETFPlan | null>(null);
    const [isFeeInfoOpen, setFeeInfoOpen] = useState(false);

    const fetchPlans = useCallback(async (uid: string) => {
        setLoading(true);
        try {
            const userPlans = await getEtfPlans(uid);
            setPlans(userPlans);
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch ETF plans.' });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        if (user) {
            fetchPlans(user.uid);
        }
    }, [user, fetchPlans]);
    
    const handleAddNew = () => {
        setEditingPlan(null);
        setIsFormOpen(true);
    };

    const handleEdit = async (planId: string) => {
        if (!user) return;
        try {
            const planWithComps = await getEtfPlan(user.uid, planId);
            if (planWithComps) {
                setEditingPlan(planWithComps);
                setIsFormOpen(true);
            }
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not load plan for editing.' });
        }
    };
    
    const handleOpenInfoDialog = (plan: ETFPlan) => {
        setInfoDialogPlan(plan);
        setIsInfoDialogOpen(true);
    };

    const handleFormSubmit = async (values: PlanFormValues) => {
        if (!user) return;
        setIsSubmitting(true);
        try {
            const monthKey = format(values.startDate, 'yyyy-MM'); // local-safe
            const startDateUtc = new Date(Date.UTC(
              values.startDate.getFullYear(),
              values.startDate.getMonth(),
              1
            ));

            const planData: Omit<ETFPlan, 'id'|'createdAt'|'updatedAt'> = {
                title: values.title,
                startDate: startDateUtc.toISOString(),
                startMonth: monthKey,
                monthContribution: values.monthContribution,
                rebalanceOnContribution: values.rebalanceOnContribution,
                baseCurrency: 'EUR' as const,
                contributionSteps: values.contributionSteps ?? [],
                frontloadFee: values.frontloadFee,
                adminFee: values.adminFee,
            };
            const componentsData: Omit<ETFComponent, 'id'>[] = values.components.map(({ id, ...comp }) => comp);

            if (editingPlan) {
                await updateEtfPlan(user.uid, editingPlan.id, planData, componentsData);
                toast({ title: 'Success', description: 'ETF Plan updated successfully.' });
            } else {
                await createEtfPlan(user.uid, planData, componentsData);
                toast({ title: 'Success', description: 'ETF Plan created successfully.' });
            }
            
            await fetchPlans(user.uid);
            setIsFormOpen(false);
            setEditingPlan(null);
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error', description: `Failed to save plan: ${(error as Error).message}` });
        } finally {
            setIsSubmitting(false);
        }
    }
    
    const handleDeletePlan = async (planId: string) => {
        if(!user) return;
        try {
            await deleteEtfPlan(user.uid, planId);
            toast({ title: 'Success', description: 'Plan deleted.'});
            fetchPlans(user.uid);
        } catch(e) {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not delete plan.' });
        }
    }
    
    const closeDialog = () => {
        setIsFormOpen(false);
        setEditingPlan(null);
    }

    return (
        <div className="min-h-screen w-full bg-background">
            <DashboardHeader isTaxView={false} onTaxViewChange={() => {}} onTaxSettingsClick={() => {}} />

            <main className="p-4 sm:p-6 lg:p-8">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-3xl font-bold font-headline">ETF Savings Plans</h1>
                    <Button onClick={handleAddNew}>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Add New Plan
                    </Button>
                </div>

                {loading ? (
                    <div className="flex justify-center items-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                ) : plans.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {plans.map(plan => {
                            const hasStepUps = plan.contributionSteps && plan.contributionSteps.length > 0;
                            const sortedSteps = hasStepUps ? [...plan.contributionSteps!].sort((a,b) => a.month.localeCompare(b.month)) : [];
                            const chips = getAdvancedFeeChips(plan);
                            const hasAdvanced = chips.length > 0;
                            
                            return (
                             <Card key={plan.id} className="flex flex-col">
                                <CardHeader>
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <CardTitle className="font-headline text-xl">{plan.title}</CardTitle>
                                            <CardDescription>Starts {format(new Date(plan.startDate), 'dd MMM yyyy')}</CardDescription>
                                        </div>
                                         <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                                <MoreVertical className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => handleEdit(plan.id)}>
                                                    <Edit className="mr-2 h-4 w-4" /> Edit
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => handleDeletePlan(plan.id)} className="text-destructive focus:text-destructive">
                                                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </CardHeader>
                                <CardContent className="flex-grow">
                                   <div className="text-sm text-muted-foreground space-y-2">
                                        <div className="flex justify-between">
                                            <span>{hasStepUps ? 'Monthly Contribution (Starting Amount):' : 'Monthly Contribution:'}</span> 
                                            <span className="font-medium text-foreground">{formatCurrency(plan.monthContribution)}</span>
                                        </div>
                                        {hasStepUps && (
                                            <div className="flex justify-between items-center">
                                                <span>Contribution Step-ups:</span>
                                                <div className="flex items-center gap-1">
                                                    <span className="font-medium text-foreground">Yes</span>
                                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" onClick={() => handleOpenInfoDialog(plan)}>
                                                        <Info className="h-4 w-4"/>
                                                    </Button>
                                                </div>
                                            </div>
                                        )}
                                        <div className="flex justify-between items-start">
                                            <span className="pt-px">{hasAdvanced ? 'Fees:' : 'Broker Fee:'}</span>
                                            <div className="flex items-center gap-2 flex-wrap justify-end max-w-[70%]">
                                                {hasAdvanced ? (
                                                <>
                                                    {chips.map((c, i) => (
                                                    <span
                                                        key={i}
                                                        className="inline-flex items-center rounded-md bg-muted/60 px-2 py-0.5 text-xs font-medium text-foreground"
                                                    >
                                                        {c}
                                                    </span>
                                                    ))}
                                                    <button
                                                        type="button"
                                                        aria-label="Advanced fee details"
                                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFeeInfoOpen(true); }}
                                                        className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                                                    >
                                                        <Info className="h-4 w-4" />
                                                    </button>
                                                </>
                                                ) : (
                                                <span className="font-medium text-foreground">None</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Rebalancing Strategy:</span> <span className="font-medium text-foreground">{plan.rebalanceOnContribution ? 'On Contribution' : 'None'}</span>
                                        </div>
                                   </div>
                                </CardContent>
                                <CardFooter>
                                    <Link href={`/etf/${plan.id}`} className="w-full">
                                        <Button className="w-full">
                                            <BarChart2 className="mr-2 h-4 w-4"/>
                                            View Simulation
                                        </Button>
                                    </Link>
                                </CardFooter>
                            </Card>
                        )})}
                    </div>
                ) : (
                    <div className="text-center py-16 rounded-lg border-2 border-dashed">
                        <h3 className="text-xl font-semibold text-foreground">No ETF Plans Found</h3>
                        <p className="text-muted-foreground mt-2">Create your first savings plan to get started.</p>
                        <Button onClick={handleAddNew} className="mt-4">
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Create First Plan
                        </Button>
                    </div>
                )}
            </main>

            <PlanModal
                open={isFormOpen}
                onOpenChange={closeDialog}
                editingPlan={editingPlan}
                onSubmit={handleFormSubmit}
                onCancel={closeDialog}
                isSubmitting={isSubmitting}
                onOpenFeeHelp={() => setFeeInfoOpen(true)}
            />

            <Dialog open={isInfoDialogOpen} onOpenChange={setIsInfoDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Contribution Schedule for {infoDialogPlan?.title}</DialogTitle>
                    </DialogHeader>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Effective Month</TableHead>
                                <TableHead className="text-right">New Monthly Amount</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {(infoDialogPlan?.contributionSteps ?? []).slice().sort((a,b) => a.month.localeCompare(b.month)).map(step => (
                                <TableRow key={step.month}>
                                    <TableCell>{format(parseISO(`${step.month}-01`), 'MMM yyyy')}</TableCell>
                                    <TableCell className="text-right font-mono">{formatCurrency(step.amount)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </DialogContent>
            </Dialog>

            <Dialog open={isFeeInfoOpen} onOpenChange={setFeeInfoOpen}>
                <DialogContent className="w-[96vw] max-w-3xl p-0">
                    <DialogHeader className="px-6 pt-6 pb-2">
                    <DialogTitle>Advanced Fees — How they are applied</DialogTitle>
                    <DialogDescription>
                        These fees affect the ETF simulation each month.
                    </DialogDescription>
                    </DialogHeader>

                    <div className="px-6 pb-6 max-h-[65vh] overflow-y-auto space-y-6 text-[0.95rem] leading-7">
                    <section className="space-y-2">
                        <h4 className="font-semibold">Front-load Fee (Sales Cost)</h4>
                        <ul className="list-disc pl-6 space-y-1">
                        <li><strong>% of Contribution</strong> — percentage taken from each monthly contribution.</li>
                        <li><strong>Fixed per Month (€)</strong> — flat amount charged monthly (usually for a limited <em>Duration (months)</em>).</li>
                        <li>If both are set, both apply. The fixed amount stops after the configured duration.</li>
                        </ul>
                        <p className="text-muted-foreground">These costs are deducted from the cash before buying ETFs.</p>
                    </section>

                    <section className="space-y-2">
                        <h4 className="font-semibold">Admin Fee (Management/Platform)</h4>
                        <ul className="list-disc pl-6 space-y-1">
                        <li><strong>Annual % of NAV</strong> — converted to a monthly rate and applied to portfolio value (NAV) each month.</li>
                        <li><strong>Fixed per Month (€)</strong> — flat monthly charge.</li>
                        <li>If both are set, both apply.</li>
                        </ul>
                    </section>

                    <p className="text-muted-foreground">
                        Notes: Prices use Yahoo <em>adjusted close</em> (dividends reinvested). Taxes and spreads are not modeled.
                    </p>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

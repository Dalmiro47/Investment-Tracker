
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
            const planData: Omit<ETFPlan, 'id'|'createdAt'|'updatedAt'> = {
                title: values.title,
                startDate: values.startDate.toISOString(),
                startMonth: values.startDate.toISOString().slice(0, 7),
                monthContribution: values.monthContribution,
                feePct: values.feePct ?? null,
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
                                        <div className="flex justify-between">
                                            {(plan.frontloadFee || plan.adminFee) ? (
                                                <>
                                                <span>Advanced Fees:</span>
                                                <span className="font-medium text-foreground">
                                                    {[
                                                        plan.frontloadFee?.percentOfContribution != null ? `${(plan.frontloadFee.percentOfContribution*100).toFixed(2)}% sales` : null,
                                                        plan.frontloadFee?.fixedPerMonthEUR ? `€${plan.frontloadFee.fixedPerMonthEUR}/mo sales` : null,
                                                        plan.adminFee?.annualPercent != null ? `${(plan.adminFee.annualPercent*100).toFixed(2)}% admin` : null,
                                                        plan.adminFee?.fixedPerMonthEUR ? `€${plan.adminFee.fixedPerMonthEUR}/mo admin` : null,
                                                    ].filter(Boolean).join(' · ')}
                                                </span>
                                                </>
                                            ) : (
                                                <>
                                                <span>Broker Fee:</span> 
                                                <span className="font-medium text-foreground">{((plan.feePct ?? 0) * 100).toFixed(2)}%</span>
                                                </>
                                            )}
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

            <Dialog open={isFormOpen} onOpenChange={closeDialog}>
              <DialogContent className="max-w-4xl w-[96vw] p-0">
                {/* Fixed-height flex shell INSIDE the dialog so the body can scroll */}
                <div
                  className="flex flex-col overflow-hidden"
                  style={{ height: 'min(78dvh, 640px)' }}    // inline style = bullet-proof in Studio
                >
                  {/* HEADER (fixed) */}
                  <div className="p-6 pb-2 border-b">
                    <DialogTitle>{editingPlan ? 'Edit ETF Plan' : 'Create New ETF Plan'}</DialogTitle>
                    <DialogDescription>
                      {editingPlan
                        ? 'Update your automated savings plan.'
                        : 'Define your automated savings plan details and components.'}
                    </DialogDescription>
                  </div>

                  {/* BODY — the ONLY scroller */}
                  <div
                    role="region"
                    aria-label="ETF plan form"
                    className="flex-1 min-h-0 px-6 pb-6 pr-3 custom-scroll"
                    style={{
                      overflowY: 'scroll',              // force visible track on Windows
                      overscrollBehavior: 'contain',
                      scrollbarGutter: 'stable',        // keeps content from jumping
                    }}
                  >
                    <PlanForm
                      formId="etf-plan-form"
                      useExternalFooter
                      plan={editingPlan ?? undefined}
                      onSubmit={handleFormSubmit}
                      onCancel={closeDialog}
                      isSubmitting={isSubmitting}
                    />
                  </div>

                  {/* FOOTER (fixed) */}
                  <div className="px-6 py-4 border-t bg-background flex justify-end gap-2">
                    <Button type="button" variant="ghost" onClick={closeDialog} disabled={isSubmitting}>Cancel</Button>
                    <Button type="submit" form="etf-plan-form" disabled={isSubmitting}>
                      {isSubmitting ? 'Saving…' : 'Save Plan'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {infoDialogPlan && (
                <Dialog open={isInfoDialogOpen} onOpenChange={setIsInfoDialogOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Contribution Schedule for {infoDialogPlan.title}</DialogTitle>
                        </DialogHeader>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Effective Month</TableHead>
                                    <TableHead className="text-right">New Monthly Amount</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {(infoDialogPlan.contributionSteps ?? []).slice().sort((a,b) => a.month.localeCompare(b.month)).map(step => (
                                    <TableRow key={step.month}>
                                        <TableCell>{format(parseISO(`${step.month}-01`), 'MMM yyyy')}</TableCell>
                                        <TableCell className="text-right font-mono">{formatCurrency(step.amount)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}

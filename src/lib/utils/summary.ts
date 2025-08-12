

import type { Investment, InvestmentType } from '@/lib/types';

export interface SummaryItem {
    type: InvestmentType;
    initialValue: number; // Represents totalCost for this summary
    currentValue: number; // Represents total marketValue for this summary
    gainLoss: number;
    gainLossPercent: number;
    portfolioPercentage: number;
}

export interface SummaryTotals {
    initialValue: number; // Represents totalCost
    currentValue: number; // Represents total marketValue
    gainLoss: number;
    gainLossPercent: number;
}

export interface PortfolioSummaryData {
    summary: Record<InvestmentType, SummaryItem>;
    totals: SummaryTotals;
}

export function summarizeByType(investments: Investment[]): PortfolioSummaryData {
    // Filter out sold investments for summary of current holdings
    const activeInvestments = investments.filter(inv => inv.status === 'Active');

    const summary: Record<string, any> = {};

    activeInvestments.forEach(inv => {
        const type = inv.type;
        if (!summary[type]) {
            summary[type] = {
                type,
                initialValue: 0, // Will be totalCost
                currentValue: 0, // Will be marketValue
            };
        }
        
        // Use aggregated totalCost if available, otherwise calculate from initial values
        const costBasisForAvailableQty = (inv.averageBuyPrice ?? inv.initialValue) * inv.quantity;
        summary[type].initialValue += costBasisForAvailableQty;

        // Calculate current market value based on available quantity
        const currentTotal = (inv.currentValue ?? (inv.averageBuyPrice ?? inv.initialValue)) * inv.quantity;
        summary[type].currentValue += currentTotal;
    });

    const totals: SummaryTotals = {
        initialValue: 0,
        currentValue: 0,
        gainLoss: 0,
        gainLossPercent: 0,
    };

    Object.values(summary).forEach(typeSum => {
        totals.initialValue += typeSum.initialValue;
        totals.currentValue += typeSum.currentValue;
    });
    
    // Now calculate percentages and gain/loss after we have totals
    Object.values(summary).forEach(typeSum => {
        typeSum.gainLoss = typeSum.currentValue - typeSum.initialValue;
        typeSum.gainLossPercent = typeSum.initialValue ? (typeSum.gainLoss / typeSum.initialValue) * 100 : 0;
        typeSum.portfolioPercentage = totals.currentValue > 0 ? (typeSum.currentValue / totals.currentValue) * 100 : 0;
    });

    totals.gainLoss = totals.currentValue - totals.initialValue;
    totals.gainLossPercent = totals.initialValue > 0 ? (totals.gainLoss / totals.initialValue) * 100 : 0;


    return { summary, totals };
}

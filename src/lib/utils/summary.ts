

import { availableQty } from '../types';
import type { Investment, InvestmentType } from '@/lib/types';

export interface SummaryItem {
    type: InvestmentType;
    costBasis: number; // Represents totalCost for this summary for *active* investments
    currentValue: number; // Represents total marketValue for this summary
    gainLoss: number;
    gainLossPercent: number;
    portfolioPercentage: number;
}

export interface SummaryTotals {
    costBasis: number; 
    currentValue: number; 
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
                costBasis: 0,
                currentValue: 0, 
            };
        }
        
        const avQty = availableQty(inv);

        // Cost basis of the remaining (available) quantity
        summary[type].costBasis += inv.purchasePricePerUnit * avQty;

        // Current market value of the remaining (available) quantity
        summary[type].currentValue += (inv.currentValue ?? inv.purchasePricePerUnit) * avQty;
    });

    const totals: SummaryTotals = {
        costBasis: 0,
        currentValue: 0,
        gainLoss: 0,
        gainLossPercent: 0,
    };

    Object.values(summary).forEach(typeSum => {
        totals.costBasis += typeSum.costBasis;
        totals.currentValue += typeSum.currentValue;
    });
    
    // Now calculate percentages and gain/loss after we have totals
    Object.values(summary).forEach(typeSum => {
        typeSum.gainLoss = typeSum.currentValue - typeSum.costBasis;
        typeSum.gainLossPercent = typeSum.costBasis ? (typeSum.gainLoss / typeSum.costBasis) * 100 : 0;
        typeSum.portfolioPercentage = totals.currentValue > 0 ? (typeSum.currentValue / totals.currentValue) * 100 : 0;
    });

    totals.gainLoss = totals.currentValue - totals.costBasis;
    totals.gainLossPercent = totals.costBasis > 0 ? (totals.gainLoss / totals.costBasis) * 100 : 0;


    return { summary, totals };
}

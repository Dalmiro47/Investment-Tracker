
import { availableQty } from '../types';
import type { Investment, InvestmentType } from '@/lib/types';

export interface SummaryItem {
    type: InvestmentType;
    totalCost: number;
    currentValue: number; // Represents total marketValue + realized proceeds for this summary
    totalReturnValue: number;
    gainLoss: number;
    gainLossPercent: number;
    portfolioPercentage: number;
}

export interface SummaryTotals {
    totalCost: number; 
    currentValue: number; // Represents total marketValue + realized proceeds for this summary
    totalReturnValue: number;
    gainLoss: number;
    gainLossPercent: number;
}

export interface PortfolioSummaryData {
    summary: Record<InvestmentType, SummaryItem>;
    totals: SummaryTotals;
}

export function summarizeByType(investments: Investment[]): PortfolioSummaryData {
    const summary: Record<string, any> = {};

    investments.forEach(inv => {
        const type = inv.type;
        if (!summary[type]) {
            summary[type] = {
                type,
                totalCost: 0,
                currentValue: 0,
                realizedProceeds: 0,
            };
        }
        
        const avQty = availableQty(inv);

        // Total original cost of all shares ever purchased for this investment
        summary[type].totalCost += inv.purchasePricePerUnit * inv.purchaseQuantity;

        // Current market value of the remaining (available) quantity
        const marketValue = (inv.currentValue ?? 0) * avQty;
        
        // Total value = what we got from selling + what we have left
        summary[type].currentValue += marketValue + inv.realizedProceeds;
        summary[type].realizedProceeds += inv.realizedProceeds;
    });

    const totals: SummaryTotals = {
        totalCost: 0,
        currentValue: 0,
        totalReturnValue: 0,
        gainLoss: 0,
        gainLossPercent: 0,
    };

    Object.values(summary).forEach(typeSum => {
        totals.totalCost += typeSum.totalCost;
        totals.currentValue += typeSum.currentValue;
    });
    
    // Now calculate percentages and gain/loss after we have totals
    Object.values(summary).forEach(typeSum => {
        typeSum.gainLoss = typeSum.currentValue - typeSum.totalCost;
        typeSum.gainLossPercent = typeSum.totalCost > 0 ? (typeSum.gainLoss / typeSum.totalCost) * 100 : 0;
        // Portfolio percentage should be based on the current market value of ACTIVE assets, not total return value.
        const activeMarketValue = typeSum.currentValue - typeSum.realizedProceeds;
        const totalActiveMarketValue = totals.currentValue - Object.values(summary).reduce((acc, s) => acc + (s.realizedProceeds ?? 0), 0);
        typeSum.portfolioPercentage = totalActiveMarketValue > 0 ? (activeMarketValue / totalActiveMarketValue) * 100 : 0;
    });

    totals.gainLoss = totals.currentValue - totals.totalCost;
    totals.gainLossPercent = totals.totalCost > 0 ? (totals.gainLoss / totals.totalCost) * 100 : 0;


    return { summary, totals };
}

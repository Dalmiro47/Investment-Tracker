

import { availableQty } from '../types';
import type { Investment, InvestmentType } from '@/lib/types';
import { dec, add, sub, mul, div, toNum } from '../money';

export interface SummaryItem {
    type: InvestmentType;
    totalCost: number;
    currentValue: number; // Represents total marketValue for this summary
    totalReturnValue: number;
    realizedPnl: number;
    unrealizedPnl: number;
    totalPnl: number;
    performance: number;
    portfolioPercentage: number;
}

export interface SummaryTotals {
    totalCost: number; 
    currentValue: number; 
    realizedPnl: number;
    unrealizedPnl: number;
    totalPnl: number;
    performance: number;
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
                costBasisOfActive: dec(0), // Cost basis of what's *left*
                marketValue: dec(0),      // Market value of what's *left*
                realizedPnl: dec(0),
                totalOriginalCost: dec(0),
            };
        }
        
        const avQty = dec(availableQty(inv));
        const purchasePrice = dec(inv.purchasePricePerUnit);

        const costOfActiveShares = mul(avQty, purchasePrice);
        const marketValue = mul(avQty, dec(inv.currentValue ?? 0));
        
        summary[type].costBasisOfActive = add(summary[type].costBasisOfActive, costOfActiveShares);
        summary[type].marketValue = add(summary[type].marketValue, marketValue);
        summary[type].realizedPnl = add(summary[type].realizedPnl, dec(inv.realizedPnL));
        summary[type].totalOriginalCost = add(summary[type].totalOriginalCost, mul(dec(inv.purchaseQuantity), purchasePrice));
    });

    const totalPortfolioMarketValue = Object.values(summary).reduce((acc, s) => add(acc, s.marketValue), dec(0));

    const finalSummary: Record<string, SummaryItem> = {};

    Object.values(summary).forEach(typeSum => {
        const unrealizedPnl = sub(typeSum.marketValue, typeSum.costBasisOfActive);
        const totalPnl = add(unrealizedPnl, typeSum.realizedPnl);
        const performance = typeSum.totalOriginalCost.eq(0) ? dec(0) : div(totalPnl, typeSum.totalOriginalCost);

        finalSummary[typeSum.type] = {
            type: typeSum.type,
            totalCost: toNum(typeSum.totalOriginalCost),
            currentValue: toNum(typeSum.marketValue),
            realizedPnl: toNum(typeSum.realizedPnl),
            unrealizedPnl: toNum(unrealizedPnl),
            totalPnl: toNum(totalPnl),
            performance: toNum(performance, 4),
            portfolioPercentage: totalPortfolioMarketValue.eq(0) ? 0 : toNum(div(typeSum.marketValue, totalPortfolioMarketValue), 4),
            totalReturnValue: 0 // This can be deprecated or redefined
        };
    });

    const totals = Object.values(finalSummary).reduce((acc, s) => {
        acc.totalCost += s.totalCost;
        acc.currentValue += s.currentValue;
        acc.realizedPnl += s.realizedPnl;
        acc.unrealizedPnl += s.unrealizedPnl;
        acc.totalPnl += s.totalPnl;
        return acc;
    }, { totalCost: 0, currentValue: 0, realizedPnl: 0, unrealizedPnl: 0, totalPnl: 0, performance: 0 });
    
    totals.performance = totals.totalCost > 0 ? totals.totalPnl / totals.totalCost : 0;

    return { summary: finalSummary, totals };
}

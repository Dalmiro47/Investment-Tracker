'use server';

import { adminDb } from '@/lib/firebase-admin';
import { calculatePositionMetrics } from '@/lib/portfolio';
import { dec, add, sub, mul, div, toNum } from '@/lib/money';
import type { Investment, Transaction } from '@/lib/types';
import type { SavingsRateChange } from '@/lib/types-savings';
import { z } from 'zod';

// Define schemas for data validation and type safety
const ViewModeSchema = z.enum(['combined', 'realized', 'holdings']);
export type ViewMode = z.infer<typeof ViewModeSchema>;

export type SummaryRow = {
  assetType: Investment['type'];
  costBasis: number;
  marketValue: number;
  realizedPL: number;
  unrealizedPL: number;
  totalPL: number;
  performancePct: number;
  sharePct: number;
};

export type SummaryData = {
  rows: SummaryRow[];
  totals: Omit<SummaryRow, 'assetType' | 'sharePct'> & { sharePct?: number };
};

const fromInvestmentDoc = (snap: any): Investment => {
  const d = snap.data();
  return {
    id: snap.id,
    ...d,
    purchaseDate: (
      d.purchaseDate?.toDate?.() ?? new Date(d.purchaseDate)
    ).toISOString(),
    createdAt: d.createdAt?.toDate?.().toISOString() ?? undefined,
    updatedAt: d.updatedAt?.toDate?.().toISOString() ?? undefined,
  } as Investment;
};

const fromTxDoc = (snap: any): Transaction => {
  const d = snap.data();
  const dt = (d.date?.toDate ? d.date.toDate() : new Date(d.date)) as Date;
  return {
    id: snap.id,
    ...d,
    date: dt.toISOString(),
  } as Transaction;
};

async function getInvestments(uid: string): Promise<Investment[]> {
  const snap = await adminDb.collection(`users/${uid}/investments`).get();
  return snap.docs.map(fromInvestmentDoc);
}

async function getAllTransactions(
  uid: string
): Promise<Record<string, Transaction[]>> {
  const investmentsSnap = await adminDb.collection(`users/${uid}/investments`).get();
  const txMap: Record<string, Transaction[]> = {};
  for (const doc of investmentsSnap.docs) {
    const txsSnap = await doc.ref.collection('transactions').get();
    txMap[doc.id] = txsSnap.docs.map(fromTxDoc);
  }
  return txMap;
}

export async function buildAllYearsSummaryAction(
  uid: string,
  mode: ViewMode
): Promise<SummaryData> {
  const investments = await getInvestments(uid);
  const transactionsMap = await getAllTransactions(uid);
  const rateSchedulesMap: Record<string, SavingsRateChange[]> = {}; // Assuming not used for AllYears view

  const metrics = investments.map((inv) =>
    calculatePositionMetrics(
      inv,
      transactionsMap[inv.id] ?? [],
      { kind: 'all' },
      rateSchedulesMap[inv.id]
    )
  );

  const byType: Record<string, any> = {};

  metrics.forEach((p) => {
    let include = false;
    switch (mode) {
      case 'combined':
        include = true;
        break;
      case 'realized':
        include = p.realizedPLAll !== 0;
        break;
      case 'holdings':
        include = p.availableQty > 1e-9;
        break;
    }

    if (include) {
      if (!byType[p.type]) {
        byType[p.type] = {
          type: p.type,
          costBasisOfActive: dec(0),
          marketValue: dec(0),
          realizedPL: dec(0),
          totalOriginalCost: dec(0),
        };
      }
      const t = byType[p.type];
      const costOfActiveShares = mul(dec(p.availableQty), dec(p.buyPrice));
      t.costBasisOfActive = add(t.costBasisOfActive, costOfActiveShares);
      t.marketValue = add(t.marketValue, dec(p.marketValue));
      t.realizedPL = add(t.realizedPL, dec(p.realizedPLAll));
      t.totalOriginalCost = add(
        t.totalOriginalCost,
        mul(dec(p.buyQty), dec(p.buyPrice))
      );
    }
  });

  const totalPortfolioMarketValue = Object.values(byType).reduce(
    (acc, s) => add(acc, s.marketValue),
    dec(0)
  );

  const rows: SummaryRow[] = Object.values(byType).map((typeSum) => {
    const unrealizedPL = sub(typeSum.marketValue, typeSum.costBasisOfActive);
    const realizedPL = mode === 'holdings' ? dec(0) : typeSum.realizedPL;
    const marketValue = mode === 'realized' ? dec(0) : typeSum.marketValue;
    const totalPL = add(unrealizedPL, realizedPL);
    const performancePct = typeSum.totalOriginalCost.eq(0)
      ? dec(0)
      : div(totalPL, typeSum.totalOriginalCost);

    return {
      assetType: typeSum.type,
      costBasis: toNum(typeSum.totalOriginalCost),
      marketValue: toNum(marketValue),
      realizedPL: toNum(realizedPL),
      unrealizedPL: toNum(unrealizedPL),
      totalPL: toNum(totalPL),
      performancePct: toNum(performancePct, 4),
      sharePct: totalPortfolioMarketValue.eq(0)
        ? 0
        : toNum(div(marketValue, totalPortfolioMarketValue), 4),
    };
  });

  const totals = rows.reduce(
    (acc, row) => {
      acc.costBasis += row.costBasis;
      acc.marketValue += row.marketValue;
      acc.realizedPL += row.realizedPL;
      acc.unrealizedPL += row.unrealizedPL;
      acc.totalPL += row.totalPL;
      return acc;
    },
    {
      costBasis: 0,
      marketValue: 0,
      realizedPL: 0,
      unrealizedPL: 0,
      totalPL: 0,
    }
  );

  const totalCostForPerf = Object.values(byType).reduce(
    (acc, s) => add(acc, s.totalOriginalCost),
    dec(0)
  );
  const totalPerformancePct = totalCostForPerf.eq(0)
    ? 0
    : totals.totalPL / toNum(totalCostForPerf);

  return {
    rows,
    totals: { ...totals, performancePct: totalPerformancePct },
  };
}

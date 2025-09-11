// This file is now a pass-through to a server action.
// It helps keep the UI hooks clean from server-specific imports.

'use client';

import type { ViewMode, SummaryData } from './actions';
import { buildAllYearsSummaryAction } from './actions';

export type { ViewMode, SummaryData, SummaryRow } from './actions';

export async function buildAllYearsSummary(
  uid: string,
  mode: ViewMode
): Promise<SummaryData> {
  return buildAllYearsSummaryAction(uid, mode);
}

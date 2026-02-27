/**
 * B) Draft / Applied state machine with explicit Apply semantics
 *
 * The reducer manages two copies of `MobileAppliedFilters`:
 *   – `applied` — the live, rendered filters (never stale)
 *   – `draft`   — the in-sheet working copy the user edits
 *
 * Changes only become `applied` via `APPLY_DRAFT_SUCCESS`, giving the
 * server action + cookie write a chance to succeed first.
 */

import {
  type MobileAppliedFilters,
  MOBILE_DEFAULTS,
  normalizeAppliedFilters,
} from "./filter-contracts";

// ── State ───────────────────────────────────────────────────────────────────

export type FilterState = {
  sheetOpen: boolean;
  applied: MobileAppliedFilters;
  draft: MobileAppliedFilters;
  dirty: boolean;
};

export function initialFilterState(
  seed?: Partial<MobileAppliedFilters>,
): FilterState {
  const { applied } = normalizeAppliedFilters(seed ?? {});
  return {
    sheetOpen: false,
    applied,
    draft: { ...applied },
    dirty: false,
  };
}

// ── Actions ─────────────────────────────────────────────────────────────────

export type FilterAction =
  | { type: "OPEN_SHEET" }
  | { type: "CLOSE_SHEET" }
  | { type: "EDIT_DRAFT"; patch: Partial<MobileAppliedFilters> }
  | { type: "RESET_DRAFT_TO_APPLIED" }
  | { type: "RESET_ALL_TO_DEFAULTS" }
  | { type: "APPLY_DRAFT_SUCCESS"; applied: MobileAppliedFilters };

// ── Reducer ─────────────────────────────────────────────────────────────────

export function filterReducer(
  state: FilterState,
  action: FilterAction,
): FilterState {
  switch (action.type) {
    case "OPEN_SHEET":
      return {
        ...state,
        sheetOpen: true,
        draft: { ...state.applied },
        dirty: false,
      };

    case "CLOSE_SHEET":
      // Preserve draft while open/close cycles are controlled by user;
      // no forced discard.
      return { ...state, sheetOpen: false };

    case "EDIT_DRAFT": {
      const candidate = { ...state.draft, ...action.patch };
      const { applied: normalized } = normalizeAppliedFilters(candidate);
      const dirty =
        JSON.stringify(normalized) !== JSON.stringify(state.applied);
      return { ...state, draft: normalized, dirty };
    }

    case "RESET_DRAFT_TO_APPLIED":
      return { ...state, draft: { ...state.applied }, dirty: false };

    case "RESET_ALL_TO_DEFAULTS":
      return { ...state, draft: { ...MOBILE_DEFAULTS }, dirty: true };

    case "APPLY_DRAFT_SUCCESS":
      return {
        ...state,
        applied: action.applied,
        draft: action.applied,
        dirty: false,
        sheetOpen: false, // strict: close only after explicit Apply success
      };

    default:
      return state;
  }
}

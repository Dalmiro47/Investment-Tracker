/**
 * F) Apply pipeline orchestrator (client integration point)
 *
 * Coordinates the draft → normalize → server-action → dispatch flow.
 * Callable from any "Apply" button handler in the mobile filter sheet.
 */
"use client";

import { type MobileAppliedFilters, normalizeAppliedFilters } from "./filter-contracts";
import { applyMobileUiSessionAction } from "@/app/actions/mobile-ui-session";
import type { FilterAction } from "./filter-reducer";

type ToastFn = (opts: {
  title: string;
  description?: string;
  variant?: "default" | "destructive";
}) => void;

/**
 * Validates and persists the draft filters through the server action,
 * then dispatches `APPLY_DRAFT_SUCCESS` to close the sheet on success.
 *
 * @param draft   - The current draft filters from the reducer
 * @param dispatch - The `filterReducer` dispatch function
 * @param userId  - The authenticated user's ID
 * @param toast   - Optional toast function for user feedback
 */
export async function commitDraftFilters(
  draft: MobileAppliedFilters,
  dispatch: React.Dispatch<FilterAction>,
  userId: string,
  toast?: ToastFn,
): Promise<void> {
  const { applied: normalizedLocal } = normalizeAppliedFilters(draft);

  // Optimistic local apply is not used here because close-on-success is strict:
  // the sheet should only close when the cookie write has succeeded.
  const res = await applyMobileUiSessionAction({
    userId,
    patch: normalizedLocal,
  });

  if (!res.success) {
    toast?.({
      title: "Failed to apply filters",
      description: res.message ?? "Please try again.",
      variant: "destructive",
    });
    return;
  }

  dispatch({ type: "APPLY_DRAFT_SUCCESS", applied: res.applied });

  toast?.({
    title: "Filters applied",
    variant: "default",
  });
}

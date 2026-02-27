/**
 * C) Next.js Server Action – session cookie persistence (no Firestore)
 *
 * Receives a partial filter patch from the client, normalizes it through
 * the canonical pipeline, and persists the result as a browser-session
 * cookie so that page refreshes restore the last-applied mobile filter state.
 */
"use server";

import { cookies } from "next/headers";
import {
  type MobileAppliedFilters,
  MOBILE_DEFAULTS,
  normalizeAppliedFilters,
} from "@/lib/mobile/filter-contracts";

// ── Constants ───────────────────────────────────────────────────────────────

const SESSION_COOKIE_KEY = "mobile_ui_filters_v1";

// ── I/O types ───────────────────────────────────────────────────────────────

type ApplyMobileUiInput = {
  /** Required by contract, though no DB write is performed. */
  userId: string;
  patch: Partial<MobileAppliedFilters>;
};

type ApplyMobileUiResult = {
  success: boolean;
  applied: MobileAppliedFilters;
  correctedFields: string[];
  message?: string;
};

// ── Server Action ───────────────────────────────────────────────────────────

export async function applyMobileUiSessionAction(
  input: ApplyMobileUiInput,
): Promise<ApplyMobileUiResult> {
  // 1) Validate shape
  if (!input?.userId || typeof input.userId !== "string") {
    return {
      success: false,
      applied: MOBILE_DEFAULTS,
      correctedFields: ["userId"],
      message: "VALIDATION_ERROR",
    };
  }

  // 2) Normalize patch
  const { applied, correctedFields } = normalizeAppliedFilters(
    input.patch ?? {},
  );

  // 3) Persist as session cookie (no maxAge ⇒ browser session)
  const payload = JSON.stringify({
    ...applied,
    v: 1,
    savedAt: new Date().toISOString(),
  });

  // NOTE: not HttpOnly because client may need to bootstrap from cookie on
  // the hydration path.  Switch to `httpOnly: true` if server-only reads.
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_KEY, payload, {
    path: "/",
    sameSite: "lax",
    secure: true,
    httpOnly: false,
  });

  return { success: true, applied, correctedFields };
}

// ── Read helper (server-only) ───────────────────────────────────────────────

/**
 * Reads the current mobile-filter cookie (if any) and returns a normalized
 * `MobileAppliedFilters`.  Safe to call from RSC or layout loaders.
 */
export async function readMobileUiSession(): Promise<MobileAppliedFilters> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_KEY)?.value;
  if (!raw) return { ...MOBILE_DEFAULTS };

  try {
    const parsed = JSON.parse(raw) as Partial<MobileAppliedFilters>;
    return normalizeAppliedFilters(parsed).applied;
  } catch {
    return { ...MOBILE_DEFAULTS };
  }
}

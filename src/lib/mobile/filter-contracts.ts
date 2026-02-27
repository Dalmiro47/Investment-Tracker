/**
 * A) Canonical filter contracts + normalization
 *
 * Single source of truth for every mobile-filter enum, the canonical
 * `MobileAppliedFilters` shape, defaults, and a normalization function that
 * clamps unknown/invalid values back to defaults while reporting corrections.
 */

// ── Enum tuples (const assertions for narrowing) ────────────────────────────

export const TypeFilterEnum = [
  "All",
  "Stock",
  "Crypto",
  "ETF",
  "Interest Account",
  "Bond",
  "Real Estate",
  "Futures",
] as const;

export const StatusFilterEnum = ["All", "Active", "Sold"] as const;
export const SortKeyEnum = ["purchaseDate", "performance", "totalAmount"] as const;
export const ViewModeEnum = ["grid", "list"] as const;
export const ListModeEnum = ["aggregated", "flat"] as const;
export const FuturesStatusEnum = ["All", "OPEN", "CLOSED", "LIQUIDATED"] as const;

// ── Canonical filter shape ──────────────────────────────────────────────────

/** Session-persistable filter bag — no free-text investment name. */
export type MobileAppliedFilters = {
  typeFilter: (typeof TypeFilterEnum)[number];
  statusFilter: (typeof StatusFilterEnum)[number];
  sortKey: (typeof SortKeyEnum)[number];
  viewMode: (typeof ViewModeEnum)[number];
  listMode: (typeof ListModeEnum)[number];
  futuresStatusFilter: (typeof FuturesStatusEnum)[number];
};

// ── Defaults ────────────────────────────────────────────────────────────────

export const MOBILE_DEFAULTS: MobileAppliedFilters = {
  typeFilter: "All",
  statusFilter: "All",
  sortKey: "purchaseDate",
  viewMode: "grid",
  listMode: "aggregated",
  futuresStatusFilter: "All",
};

// ── Normalization ───────────────────────────────────────────────────────────

/**
 * Clamps an arbitrary partial input to a fully-valid `MobileAppliedFilters`
 * object.  Any field that is missing or holds an out-of-range value falls back
 * to its default; the caller receives the list of fields that were corrected.
 */
export function normalizeAppliedFilters(
  input: Partial<MobileAppliedFilters>,
): { applied: MobileAppliedFilters; correctedFields: string[] } {
  const correctedFields: string[] = [];
  const applied: MobileAppliedFilters = { ...MOBILE_DEFAULTS };

  const setEnum = <T extends readonly string[]>(
    key: keyof MobileAppliedFilters,
    allowed: T,
    val: unknown,
  ) => {
    if (typeof val === "string" && (allowed as readonly string[]).includes(val)) {
      (applied as Record<string, unknown>)[key] = val;
    } else if (val !== undefined) {
      correctedFields.push(String(key));
    }
  };

  setEnum("typeFilter", TypeFilterEnum, input.typeFilter);
  setEnum("statusFilter", StatusFilterEnum, input.statusFilter);
  setEnum("sortKey", SortKeyEnum, input.sortKey);
  setEnum("viewMode", ViewModeEnum, input.viewMode);
  setEnum("listMode", ListModeEnum, input.listMode);
  setEnum("futuresStatusFilter", FuturesStatusEnum, input.futuresStatusFilter);

  // Invariant: Futures requires list mode
  if (applied.typeFilter === "Futures" && applied.viewMode !== "list") {
    applied.viewMode = "list";
    correctedFields.push("viewMode");
  }

  return { applied, correctedFields };
}

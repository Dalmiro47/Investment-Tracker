"use client";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Check, LayoutGrid, List, SlidersHorizontal } from "lucide-react";
import React from "react";
import { cn } from "@/lib/utils";

import {
  type MobileAppliedFilters,
  TypeFilterEnum,
  StatusFilterEnum,
  SortKeyEnum,
  ViewModeEnum,
  ListModeEnum,
  FuturesStatusEnum,
  MOBILE_DEFAULTS,
  filterReducer,
  initialFilterState,
  commitDraftFilters,
  normalizeAppliedFilters,
} from "@/lib/mobile";
import { useToast } from "@/hooks/use-toast";

type TypeFilterValue = (typeof TypeFilterEnum)[number];
type StatusFilterValue = (typeof StatusFilterEnum)[number];
type SortKeyValue = (typeof SortKeyEnum)[number];
type ViewModeValue = (typeof ViewModeEnum)[number];
type ListModeValue = (typeof ListModeEnum)[number];
type FuturesStatusValue = (typeof FuturesStatusEnum)[number];

const TYPE_LABELS: Record<TypeFilterValue, string> = {
  All: "All",
  Stock: "Stocks",
  Crypto: "Crypto",
  ETF: "ETFs",
  "Interest Account": "Interest",
  Bond: "Bonds",
  "Real Estate": "Real Estate",
  Futures: "Futures",
};

const SORT_LABELS: Record<SortKeyValue, string> = {
  purchaseDate: "Purchase date",
  performance: "Performance",
  totalAmount: "Total amount",
};

const SORT_SHORT: Record<SortKeyValue, string> = {
  purchaseDate: "date",
  performance: "performance",
  totalAmount: "amount",
};

const FILTER_KEYS = Object.keys(MOBILE_DEFAULTS) as (keyof MobileAppliedFilters)[];

function countDiff(a: MobileAppliedFilters, b: MobileAppliedFilters): number {
  return FILTER_KEYS.filter((key) => a[key] !== b[key]).length;
}

interface MobileFiltersProps {
  userId: string;
  initialFilters: MobileAppliedFilters;
  /** Called when the user applies the draft — parent syncs its own state. */
  onApply: (applied: MobileAppliedFilters) => void;
  /** Per-type position counts for the chip rail (optional). */
  typeCounts?: Partial<Record<TypeFilterValue, number>>;
  /** Number of rows currently rendered, shown in the status line. */
  resultCount?: number;
  children?: React.ReactNode;
}

export function MobileFilters({
  userId,
  initialFilters,
  onApply,
  typeCounts,
  resultCount,
  children,
}: MobileFiltersProps) {
  const { toast } = useToast();
  const [state, dispatch] = React.useReducer(
    filterReducer,
    initialFilters,
    (seed) => initialFilterState(seed),
  );

  // Keep the reducer in sync when the parent changes applied filters externally
  const parentRef = React.useRef(initialFilters);
  React.useEffect(() => {
    if (JSON.stringify(parentRef.current) !== JSON.stringify(initialFilters)) {
      parentRef.current = initialFilters;
      dispatch({ type: "APPLY_DRAFT_SUCCESS", applied: initialFilters });
    }
  }, [initialFilters]);

  const handleApply = async () => {
    await commitDraftFilters(state.draft, dispatch, userId, toast);
    onApply(state.draft);
  };

  const handleReset = () => {
    dispatch({ type: "RESET_ALL_TO_DEFAULTS" });
  };

  /**
   * Chip-rail taps commit straight through the same pipeline as Apply —
   * the patch is merged onto the live `applied` bag, normalized by the
   * shared contract, then persisted by `commitDraftFilters`.
   */
  const commitPatch = async (patch: Partial<MobileAppliedFilters>) => {
    const { applied: next } = normalizeAppliedFilters({ ...state.applied, ...patch });
    if (countDiff(next, state.applied) === 0) return;
    await commitDraftFilters(next, dispatch, userId, toast);
    onApply(next);
  };

  const isFuturesDraft = state.draft.typeFilter === "Futures";
  const isFuturesApplied = state.applied.typeFilter === "Futures";

  const activeCount = countDiff(state.applied, MOBILE_DEFAULTS);
  const pendingCount = countDiff(state.draft, state.applied);

  const statusText = isFuturesApplied
    ? state.applied.futuresStatusFilter === "All"
      ? "All statuses"
      : state.applied.futuresStatusFilter
    : state.applied.statusFilter === "All"
      ? "All statuses"
      : state.applied.statusFilter;

  return (
    <Sheet
      open={state.sheetOpen}
      onOpenChange={(open) =>
        dispatch({ type: open ? "OPEN_SHEET" : "CLOSE_SHEET" })
      }
    >
      {/* ── Always-visible chip rail + status line ── */}
      <div
        className="sticky-bar sticky z-30 -mx-4 py-2.5 sm:-mx-6 md:hidden"
        style={{ top: "calc(56px + env(safe-area-inset-top))" }}
      >
        <div className="hide-scroll flex gap-1.5 overflow-x-auto px-4 sm:px-6" role="tablist" aria-label="Asset type">
          {TypeFilterEnum.map((type) => {
            const active = state.applied.typeFilter === type;
            const count = typeCounts?.[type];
            return (
              <button
                key={type}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => void commitPatch({ typeFilter: type })}
                className={cn(
                  "flex h-[34px] shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition-colors",
                  active
                    ? "border-primary/45 bg-primary/[.12] text-primary shadow-[0_0_18px_hsl(var(--primary)/.12)]"
                    : "border-input text-muted-foreground",
                )}
              >
                {TYPE_LABELS[type]}
                {count !== undefined && (
                  <span className={cn("font-mono text-[11px] font-medium", active ? "text-primary/75" : "text-muted-foreground/70")}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3 px-4 pt-2.5 sm:px-6">
          <span className="min-w-0 truncate text-[12px] text-muted-foreground">
            {resultCount !== undefined && (
              <span className="font-mono text-foreground">{resultCount}</span>
            )}{" "}
            positions · {statusText} · by {SORT_SHORT[state.applied.sortKey]}
          </span>
          <SheetTrigger asChild>
            <button
              type="button"
              className="flex h-9 shrink-0 items-center gap-2 rounded-full border border-input px-3 text-[13px] font-semibold text-foreground"
              aria-label="Open filters"
            >
              <SlidersHorizontal size={16} />
              Filters
              {activeCount > 0 && (
                <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-[5px] font-mono text-[11px] font-extrabold text-primary-foreground">
                  {activeCount}
                </span>
              )}
            </button>
          </SheetTrigger>
        </div>
      </div>

      <SheetContent
        side="bottom"
        className="flex max-h-[88dvh] flex-col gap-0 px-0 pb-0 pt-2"
      >
        <div className="flex items-center justify-between px-[18px] pb-2 pt-1">
          <SheetTitle className="text-[18px]">Configure view</SheetTitle>
        </div>

        <div className="hide-scroll flex flex-1 flex-col gap-5 overflow-y-auto px-[18px] pb-3 pt-1">
          {/* ── Asset Type ── */}
          <div className="flex flex-col gap-2.5">
            <span className="eyebrow">Asset type</span>
            <div className="grid grid-cols-2 gap-2">
              {TypeFilterEnum.map((type) => {
                const active = state.draft.typeFilter === type;
                return (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      dispatch({ type: "EDIT_DRAFT", patch: { typeFilter: type } })
                    }
                    className={cn(
                      "flex h-10 items-center justify-center gap-1.5 rounded-full border text-[13px] font-semibold transition-colors",
                      active
                        ? "border-primary/45 bg-primary/[.12] text-primary"
                        : "border-input text-muted-foreground",
                    )}
                  >
                    {active && <Check size={16} />}
                    {TYPE_LABELS[type]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Status ── */}
          {!isFuturesDraft ? (
            <div className="flex flex-col gap-2.5">
              <span className="eyebrow">Status</span>
              <Tabs
                value={state.draft.statusFilter}
                onValueChange={(val) =>
                  dispatch({
                    type: "EDIT_DRAFT",
                    patch: { statusFilter: val as StatusFilterValue },
                  })
                }
              >
                <TabsList className="grid w-full grid-cols-3">
                  {StatusFilterEnum.map((s) => (
                    <TabsTrigger key={s} value={s} className="py-2.5">
                      {s === "All" ? "All" : s}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              <span className="eyebrow">Futures status</span>
              <Tabs
                value={state.draft.futuresStatusFilter}
                onValueChange={(val) =>
                  dispatch({
                    type: "EDIT_DRAFT",
                    patch: { futuresStatusFilter: val as FuturesStatusValue },
                  })
                }
              >
                <TabsList className="grid w-full grid-cols-4">
                  {FuturesStatusEnum.map((s) => (
                    <TabsTrigger key={s} value={s} className="px-1 py-2.5 text-[12px]">
                      {s === "All" ? "All" : s}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
          )}

          {/* ── Sort ── */}
          {!isFuturesDraft && (
            <div className="flex flex-col gap-2.5">
              <span className="eyebrow">Sort by</span>
              <div
                className="flex flex-col overflow-hidden rounded-xl border border-border"
                role="radiogroup"
                aria-label="Sort by"
              >
                {SortKeyEnum.map((key, index) => {
                  const active = state.draft.sortKey === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() =>
                        dispatch({ type: "EDIT_DRAFT", patch: { sortKey: key } })
                      }
                      className={cn(
                        "flex h-[46px] items-center justify-between px-3.5 text-left text-[13px] font-semibold transition-colors",
                        index > 0 && "border-t border-border",
                        active ? "bg-primary/[.08] text-primary" : "text-foreground",
                      )}
                    >
                      {SORT_LABELS[key]}
                      <span
                        aria-hidden
                        className={cn(
                          "grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-2",
                          active ? "border-primary" : "border-input",
                        )}
                      >
                        {active && (
                          <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── View Mode ── */}
          {!isFuturesDraft && (
            <div className="flex flex-col gap-2.5">
              <span className="eyebrow">View</span>
              <Tabs
                value={state.draft.viewMode}
                onValueChange={(val) =>
                  dispatch({
                    type: "EDIT_DRAFT",
                    patch: { viewMode: val as ViewModeValue },
                  })
                }
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="grid" className="py-2.5">
                    <LayoutGrid size={16} /> Cards
                  </TabsTrigger>
                  <TabsTrigger value="list" className="py-2.5">
                    <List size={16} /> List
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          )}

          {/* ── List Mode (only when list + non-Futures) ── */}
          {!isFuturesDraft && state.draft.viewMode === "list" && (
            <div className="flex flex-col gap-2.5">
              <span className="eyebrow">List mode</span>
              <Tabs
                value={state.draft.listMode}
                onValueChange={(val) =>
                  dispatch({
                    type: "EDIT_DRAFT",
                    patch: { listMode: val as ListModeValue },
                  })
                }
              >
                <TabsList className="grid w-full grid-cols-2">
                  {ListModeEnum.map((m) => (
                    <TabsTrigger key={m} value={m} className="py-2.5 capitalize">
                      {m}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
          )}

          {/* ── Extra controls passed by parent ── */}
          {children && <div className="space-y-4">{children}</div>}
        </div>

        {/* ── Footer: Reset + Apply ── */}
        <div
          className="mt-auto flex gap-2.5 border-t border-border px-[18px] pt-3"
          style={{ paddingBottom: "calc(18px + env(safe-area-inset-bottom))" }}
        >
          <Button variant="outline" className="h-[46px] flex-1" onClick={handleReset}>
            Reset
          </Button>
          <Button
            className="h-[46px] flex-[2]"
            disabled={!state.dirty}
            onClick={handleApply}
          >
            Apply
            {pendingCount > 0 && (
              <span className="font-mono font-semibold opacity-75">
                ({pendingCount} {pendingCount === 1 ? "change" : "changes"})
              </span>
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

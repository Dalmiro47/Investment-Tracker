"use client";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SlidersHorizontal } from "lucide-react";
import React from "react";

import {
  type MobileAppliedFilters,
  TypeFilterEnum,
  StatusFilterEnum,
  SortKeyEnum,
  ViewModeEnum,
  ListModeEnum,
  FuturesStatusEnum,
  filterReducer,
  initialFilterState,
  commitDraftFilters,
} from "@/lib/mobile";
import { useToast } from "@/hooks/use-toast";

interface MobileFiltersProps {
  userId: string;
  initialFilters: MobileAppliedFilters;
  /** Called when the user applies the draft — parent syncs its own state. */
  onApply: (applied: MobileAppliedFilters) => void;
  children?: React.ReactNode;
}

export function MobileFilters({
  userId,
  initialFilters,
  onApply,
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

  const isFuturesDraft = state.draft.typeFilter === "Futures";

  return (
    <div className="md:hidden my-3 flex flex-col gap-3">
      <Sheet
        open={state.sheetOpen}
        onOpenChange={(open) =>
          dispatch({ type: open ? "OPEN_SHEET" : "CLOSE_SHEET" })
        }
      >
        <SheetTrigger className="ml-auto flex items-center rounded border px-3 py-2 text-sm">
          <SlidersHorizontal className="mr-2 size-4" /> Filters
        </SheetTrigger>
        <SheetContent
          side="bottom"
          className="h-[75vh] flex flex-col pb-[env(safe-area-inset-bottom)]"
        >
          <SheetTitle>Configure View</SheetTitle>

          <div className="flex-1 overflow-y-auto px-4 mt-4 flex flex-col gap-6">
            {/* ── Asset Type ── */}
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">
                Asset Type
              </label>
              <Select
                value={state.draft.typeFilter}
                onValueChange={(val) =>
                  dispatch({
                    type: "EDIT_DRAFT",
                    patch: {
                      typeFilter: val as (typeof TypeFilterEnum)[number],
                    },
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select asset type" />
                </SelectTrigger>
                <SelectContent>
                  {TypeFilterEnum.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* ── Status ── */}
            {!isFuturesDraft ? (
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">
                  Status
                </label>
                <Select
                  value={state.draft.statusFilter}
                  onValueChange={(val) =>
                    dispatch({
                      type: "EDIT_DRAFT",
                      patch: {
                        statusFilter: val as (typeof StatusFilterEnum)[number],
                      },
                    })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    {StatusFilterEnum.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s === "All" ? "All Statuses" : s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">
                  Futures Status
                </label>
                <Select
                  value={state.draft.futuresStatusFilter}
                  onValueChange={(val) =>
                    dispatch({
                      type: "EDIT_DRAFT",
                      patch: {
                        futuresStatusFilter:
                          val as (typeof FuturesStatusEnum)[number],
                      },
                    })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    {FuturesStatusEnum.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s === "All" ? "All Statuses" : s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* ── Sort ── */}
            {!isFuturesDraft && (
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">
                  Sort By
                </label>
                <Select
                  value={state.draft.sortKey}
                  onValueChange={(val) =>
                    dispatch({
                      type: "EDIT_DRAFT",
                      patch: {
                        sortKey: val as (typeof SortKeyEnum)[number],
                      },
                    })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="purchaseDate">Date</SelectItem>
                    <SelectItem value="performance">Performance</SelectItem>
                    <SelectItem value="totalAmount">Total Amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* ── View Mode ── */}
            {!isFuturesDraft && (
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">
                  View Mode
                </label>
                <Select
                  value={state.draft.viewMode}
                  onValueChange={(val) =>
                    dispatch({
                      type: "EDIT_DRAFT",
                      patch: {
                        viewMode: val as (typeof ViewModeEnum)[number],
                      },
                    })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="grid">Cards</SelectItem>
                    <SelectItem value="list">List</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* ── List Mode (only when list + non-Futures) ── */}
            {!isFuturesDraft && state.draft.viewMode === "list" && (
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">
                  List Mode
                </label>
                <Select
                  value={state.draft.listMode}
                  onValueChange={(val) =>
                    dispatch({
                      type: "EDIT_DRAFT",
                      patch: {
                        listMode: val as (typeof ListModeEnum)[number],
                      },
                    })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aggregated">Aggregated</SelectItem>
                    <SelectItem value="flat">Flat</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* ── Extra controls passed by parent ── */}
            {children && (
              <div className="space-y-4">{children}</div>
            )}
          </div>

          {/* ── Footer: Reset + Apply ── */}
          <div className="mt-auto border-t p-4 flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleReset}
            >
              Reset
            </Button>
            <Button
              className="flex-1"
              disabled={!state.dirty}
              onClick={handleApply}
            >
              Apply
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

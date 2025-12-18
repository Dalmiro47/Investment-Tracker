"use client";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { SlidersHorizontal } from "lucide-react";
import React from "react";

type View = "grid" | "list";
type Mode = "aggregated" | "flat";

interface Props {
  view: View;
  setView: (v: View) => void;
  mode: Mode;
  setMode: (m: Mode) => void;
  isFuturesView?: boolean;
  children?: React.ReactNode;
}

export function MobileFilters({ view, setView, mode, setMode, isFuturesView, children }: Props) {
  return (
    <div className="md:hidden my-3 flex items-center justify-between">
      <div className="inline-flex rounded-md border border-border bg-muted p-1">
        <button
          onClick={() => setView("grid")}
          className={`px-3 py-1.5 text-sm rounded ${view==="grid" ? "bg-background shadow" : "text-muted-foreground"}`}>
          Cards
        </button>
        <button
          onClick={() => setView("list")}
          className={`px-3 py-1.5 text-sm rounded ${view==="list" ? "bg-background shadow" : "text-muted-foreground"}`}>
          List
        </button>
      </div>
      {view==="list" && !isFuturesView && (
        <div className="ml-2 inline-flex rounded-md border border-border bg-muted p-1">
          <button
            onClick={() => setMode("aggregated")}
            className={`px-3 py-1.5 text-sm rounded ${mode==="aggregated" ? "bg-background shadow" : "text-muted-foreground"}`}>
            Aggregated
          </button>
          <button
            onClick={() => setMode("flat")}
            className={`px-3 py-1.5 text-sm rounded ${mode==="flat" ? "bg-background shadow" : "text-muted-foreground"}`}>
            Flat
          </button>
        </div>
      )}
      <Sheet>
        <SheetTrigger className="ml-auto rounded border px-3 py-2 text-sm">
          <SlidersHorizontal className="mr-2 inline-block size-4" /> Filters
        </SheetTrigger>
        <SheetContent side="bottom" className="h-[70vh] overflow-y-auto pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto mt-2 w-full px-4 sm:px-6">{children}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

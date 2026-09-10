"use client";
import { Sheet, SheetContent, SheetTitle, SheetTrigger, SheetClose } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Menu, Settings, Scale, ReceiptText } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import type { YearFilter } from "@/lib/types";

export type TopBarProps = {
  onTaxSettingsClick?: () => void;
  onViewTaxEstimate?: () => void;
  isTaxView?: boolean;
  onToggleTaxView?: () => void;
  sellYears: number[];
  yearFilter: YearFilter;
  onYearFilterChange: (filter: YearFilter) => void;
};

export default function TopBar({
  onTaxSettingsClick = () => {},
  onViewTaxEstimate = () => {},
  isTaxView = false,
  onToggleTaxView = () => {},
  sellYears,
  yearFilter,
  onYearFilterChange,
}: TopBarProps) {
  const handleYearChange = (value: string) => {
    if (value === "all") {
      onYearFilterChange({ kind: "all", mode: yearFilter.mode });
    } else {
      onYearFilterChange({ kind: "year", year: Number(value), mode: yearFilter.mode });
    }
  };

  return (
    <header
      className="sticky-bar fixed inset-x-0 top-0 z-40 md:hidden will-change-transform"
      style={{ paddingTop: "env(safe-area-inset-top)", WebkitTransform: "translateZ(0)" }}
    >
      <div className="mx-auto flex h-14 w-full items-center justify-between px-4">
        <div className="flex min-w-0 items-center gap-[9px]">
          <BrandMark size={26} className="shrink-0" />
          <span className="truncate font-headline text-[16px] font-bold tracking-tight">
            DDS Investment
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {/* Quick access to the estimate while the tax report is on; the sheet
              entry below is what turns the report on in the first place. */}
          {isTaxView && (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-warning hover:text-warning"
              onClick={onViewTaxEstimate}
              aria-label="View Tax Estimate"
            >
              <Scale size={20} />
            </Button>
          )}

          <Select
            value={yearFilter.kind === "year" ? String(yearFilter.year) : "all"}
            onValueChange={handleYearChange}
          >
            <SelectTrigger
              aria-label="Select tax year"
              className="h-8 w-auto min-w-0 gap-1.5 px-2.5 text-[12px] md:h-8"
            >
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {sellYears.map((year) => (
                <SelectItem key={year} value={String(year)}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Overflow menu */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Open menu">
                <Menu size={20} />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="glass-strong w-72 max-w-[85vw] rounded-l-[22px] p-4"
              // Start below the TopBar (56px + status-bar safe area): the drawer and
              // its close button must never overlap the phone's clock/battery strip
              // or the "DDS Investment" banner.
              style={{ top: "calc(56px + env(safe-area-inset-top))" }}
            >
              <SheetTitle className="px-2 pb-2 pt-1">Menu</SheetTitle>
              <nav className="mt-2 flex flex-col" aria-label="Quick actions">
                <div className="flex h-[46px] items-center justify-between gap-3 rounded-[10px] px-3">
                  <span className="flex items-center gap-2 text-[13px] font-semibold">
                    <ReceiptText size={20} className="text-warning" />
                    German Tax Report
                  </span>
                  <Switch
                    checked={isTaxView}
                    onCheckedChange={onToggleTaxView}
                    aria-label="Toggle German Tax Report"
                  />
                </div>
                <SheetClose asChild>
                  <button
                    type="button"
                    onClick={onTaxSettingsClick}
                    className="flex h-[46px] w-full items-center gap-2 rounded-[10px] px-3 text-left text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    aria-label="Open Tax Settings"
                  >
                    <Settings size={20} /> Tax Settings
                  </button>
                </SheetClose>
                <SheetClose asChild>
                  <button
                    type="button"
                    onClick={onViewTaxEstimate}
                    className="flex h-[46px] w-full items-center gap-2 rounded-[10px] px-3 text-left text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    aria-label="View Tax Estimate"
                  >
                    <Scale size={20} /> View Tax Estimate
                  </button>
                </SheetClose>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

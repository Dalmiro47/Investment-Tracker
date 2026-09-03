
"use client";
import * as React from "react";
import TopBar from "./TopBar";
import BottomTabs, { type Section } from "./BottomTabs";
import { useOrientationStability } from "@/lib/mobile/useOrientationStability";
import type { YearFilter } from "@/lib/types";

export type MobileAppShellProps = React.PropsWithChildren<{
  section: Section;
  onSectionChange: (s: Section) => void;
  onTaxSettingsClick?: () => void;
  onViewTaxEstimate?: () => void;
  isTaxView?: boolean;
  onToggleTaxView?: () => void;
  sellYears: number[];
  yearFilter: YearFilter;
  onYearFilterChange: (filter: YearFilter) => void;
}>;

export function MobileAppShell({
  children,
  section,
  onSectionChange,
  onTaxSettingsClick = () => {},
  onViewTaxEstimate = () => {},
  isTaxView = false,
  onToggleTaxView = () => {},
  sellYears,
  yearFilter,
  onYearFilterChange,
}: MobileAppShellProps) {
  const { stable, height } = useOrientationStability();

  // Core Logic: When unstable (during rotation), freeze min-height using
  // the raw pixel value.  This prevents Shadcn Sheet and other portal-based
  // overlays from collapsing or causing a dark screen repaint.
  // Use 100dvh only when stable to account for the dynamic browser address bar.
  return (
    <div
      className="relative z-[1] w-full md:hidden text-foreground transition-opacity duration-150"
      style={{
        minHeight: stable ? "100dvh" : `${height}px`,
        opacity: stable ? 1 : 0.98,
        // `clip` (not `hidden`): `overflow-x: hidden` forces `overflow-y: auto`,
        // making this a scroll container and silently disabling the sticky
        // filter rail below the TopBar. Stability values above are untouched.
        overflowX: "clip",
      }}
    >
      <TopBar
        onTaxSettingsClick={onTaxSettingsClick}
        onViewTaxEstimate={onViewTaxEstimate}
        isTaxView={isTaxView}
        onToggleTaxView={onToggleTaxView}
        sellYears={sellYears}
        yearFilter={yearFilter}
        onYearFilterChange={onYearFilterChange}
      />
      <main
        className="pb-[120px] pt-[56px]"
        style={{ paddingTop: "calc(56px + env(safe-area-inset-top))" }}
      >
        {children}
      </main>
      <BottomTabs section={section} onChange={onSectionChange} />
    </div>
  );
}

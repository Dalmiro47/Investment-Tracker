
"use client";
import * as React from "react";
import TopBar from "./TopBar";
import BottomTabs, { type Section } from "./BottomTabs";
import { useOrientationStability } from "@/lib/mobile/useOrientationStability";

export type MobileAppShellProps = React.PropsWithChildren<{
  section: Section;
  onSectionChange: (s: Section) => void;
  onTaxSettingsClick?: () => void;
  onViewTaxEstimate?: () => void;
  isTaxView?: boolean;
  onToggleTaxView?: () => void;
}>;

export function MobileAppShell({
  children,
  section,
  onSectionChange,
  onTaxSettingsClick = () => {},
  onViewTaxEstimate = () => {},
  isTaxView = false,
  onToggleTaxView = () => {},
}: MobileAppShellProps) {
  const { stable, height } = useOrientationStability();

  // Core Logic: When unstable (during rotation), freeze min-height using
  // the raw pixel value.  This prevents Shadcn Sheet and other portal-based
  // overlays from collapsing or causing a dark screen repaint.
  // Use 100dvh only when stable to account for the dynamic browser address bar.
  return (
    <div
      className="relative w-full md:hidden bg-background text-foreground transition-opacity duration-150"
      style={{
        minHeight: stable ? "100dvh" : `${height}px`,
        opacity: stable ? 1 : 0.98,
        overflowX: "hidden",
      }}
    >
      <TopBar
        onTaxSettingsClick={onTaxSettingsClick}
        onViewTaxEstimate={onViewTaxEstimate}
        isTaxView={isTaxView}
        onToggleTaxView={onToggleTaxView}
      />
      <main
        className="pb-20 pt-[56px]"
        style={{ paddingTop: "calc(56px + env(safe-area-inset-top))" }}
      >
        {children}
      </main>
      <BottomTabs section={section} onChange={onSectionChange} />
    </div>
  );
}

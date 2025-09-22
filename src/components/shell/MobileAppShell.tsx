"use client";
import * as React from "react";
import TopBar from "./TopBar";
import BottomTabs from "./BottomTabs";

type Section = "dashboard" | "list" | "summary";

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
  return (
    <div className="relative min-h-screen md:hidden bg-background text-foreground">
      <TopBar
        onTaxSettingsClick={onTaxSettingsClick}
        onViewTaxEstimate={onViewTaxEstimate}
        isTaxView={isTaxView}
        onToggleTaxView={onToggleTaxView}
      />
      <main className="pb-20 pt-[56px]"
            style={{
              paddingTop: "calc(56px + env(safe-area-inset-top))",
            }}>
        {children}
      </main>
      <BottomTabs section={section} onChange={onSectionChange} />
    </div>
  );
}

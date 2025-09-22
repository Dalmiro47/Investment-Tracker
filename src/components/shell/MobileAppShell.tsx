"use client";
import * as React from "react";
import TopBar from "./TopBar";
import BottomTabs from "./BottomTabs";

type Section = "dashboard" | "list" | "summary";

type Props = React.PropsWithChildren<{
  section: Section;
  onSectionChange: (s: Section) => void;
  onTaxSettingsClick?: () => void;
  onViewTaxEstimate?: () => void;
}>;

export function MobileAppShell({
  children,
  section,
  onSectionChange,
  onTaxSettingsClick = () => {},
  onViewTaxEstimate = () => {},
}: Props) {
  return (
    <div className="relative min-h-screen md:hidden bg-background text-foreground">
      <TopBar
        onTaxSettingsClick={onTaxSettingsClick}
        onViewTaxEstimate={onViewTaxEstimate}
      />
      <main className="mx-auto w-full max-w-[430px] px-4 pb-20 pt-[56px]"
            style={{
              paddingTop: "calc(56px + env(safe-area-inset-top))",
            }}>
        {children}
      </main>
      <BottomTabs section={section} onChange={onSectionChange} />
    </div>
  );
}

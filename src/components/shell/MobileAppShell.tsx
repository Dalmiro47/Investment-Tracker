"use client";
import React from "react";
import { TopBar, TopBarProps } from "@/components/shell/TopBar";
import { BottomTabs } from "@/components/shell/BottomTabs";

type Props = {
  children: React.ReactNode;
  onTaxSettingsClick?: () => void;
  onViewTaxEstimate?: () => void;
};


export function MobileAppShell({
  children,
  onTaxSettingsClick = () => {},
  onViewTaxEstimate = () => {},
}: Props) {
  // Max 430px typical app width, padded and safe-area aware
  return (
    <div className="md:hidden bg-background text-foreground">
      <TopBar onTaxSettingsClick={onTaxSettingsClick} onViewTaxEstimate={onViewTaxEstimate} />
      <main className="mx-auto w-full max-w-[430px] px-4 pb-[72px] pt-[56px]"
            style={{
              paddingTop: "calc(56px + env(safe-area-inset-top))",
              paddingBottom: "calc(72px + env(safe-area-inset-bottom))"
            }}>
        {children}
      </main>
      <BottomTabs />
    </div>
  );
}

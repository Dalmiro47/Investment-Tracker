"use client";
import { Sheet, SheetContent, SheetTrigger, SheetClose } from "@/components/ui/sheet";
import { Menu, Settings, Scale } from "lucide-react";
import { Button } from "../ui/button";

export type TopBarProps = {
  onTaxSettingsClick: () => void;
  onViewTaxEstimate: () => void;
};


export function TopBar({ onTaxSettingsClick, onViewTaxEstimate }: TopBarProps) {
  return (
    <header className="fixed inset-x-0 top-0 z-40 md:hidden
      bg-muted/40 backdrop-blur supports-[backdrop-filter]:bg-background/70
      border-b border-border will-change-transform"
      style={{ paddingTop: "env(safe-area-inset-top)", WebkitTransform: "translateZ(0)" }}>
      <div className="mx-auto flex h-14 max-w-[430px] items-center justify-between px-3">
        <div className="flex items-center gap-2">
          {/* Small glyph only on mobile */}
          <div className="size-7 rounded bg-primary/20 grid place-items-center">
            <span className="text-primary font-bold">₿</span>
          </div>
          <span className="font-semibold tracking-tight">Investment Tracker</span>
        </div>

        {/* Overflow menu */}
        <Sheet>
          <SheetTrigger asChild>
             <Button variant="ghost" size="icon" className="p-2 h-auto w-auto rounded hover:bg-muted" aria-label="Open menu">
                <Menu className="size-5" />
             </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72">
            <nav className="mt-6 grid gap-2" aria-label="Quick actions">
               <SheetClose asChild>
                <button
                  onClick={onTaxSettingsClick}
                  className="flex items-center gap-2 rounded px-3 py-2 hover:bg-muted w-full text-left"
                >
                  <Settings className="size-4" /> Tax Settings
                </button>
              </SheetClose>
               <SheetClose asChild>
                <button
                  onClick={onViewTaxEstimate}
                  className="flex items-center gap-2 rounded px-3 py-2 hover:bg-muted w-full text-left"
                >
                  <Scale className="size-4" /> View Tax Estimate
                </button>
              </SheetClose>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}

"use client";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, Settings, Scale } from "lucide-react";
import Link from "next/link";

export function TopBar() {
  return (
    <header className="fixed inset-x-0 top-0 z-40 md:hidden
      bg-muted/40 backdrop-blur supports-[backdrop-filter]:bg-background/70
      border-b border-border"
      style={{ paddingTop: "env(safe-area-inset-top)" }}>
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
          <SheetTrigger className="p-2 rounded hover:bg-muted">
            <Menu className="size-5" />
          </SheetTrigger>
          <SheetContent side="right" className="w-72">
            <nav className="mt-6 grid gap-2">
              <Link className="flex items-center gap-2 rounded px-3 py-2 hover:bg-muted" href="/tax">
                <Settings className="size-4" /> Tax Settings
              </Link>
              <Link className="flex items-center gap-2 rounded px-3 py-2 hover:bg-muted" href="/tax/estimate">
                <Scale className="size-4" /> View Tax Estimate
              </Link>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}

"use client";
import { Home, BarChart3 } from "lucide-react";

export type Section = "summary" | "investments";

export default function BottomTabs({
  section,
  onChange,
}: {
  section: Section;
  onChange: (s: Section) => void;
}) {
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 md:hidden border-t border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
      role="tablist"
    >
      <div className="mx-auto flex w-full items-stretch justify-around py-2">
        <button
          role="tab"
          aria-selected={section === "summary"}
          aria-label="Summary"
          className={`flex flex-col items-center gap-1 px-6 py-1 rounded-md ${
            section === "summary" ? "text-primary" : "text-muted-foreground"
          }`}
          onClick={() => onChange("summary")}
        >
          <BarChart3 className="h-5 w-5" />
          <span className="text-xs">Summary</span>
        </button>

        <button
          role="tab"
          aria-selected={section === "investments"}
          aria-label="Investments"
          className={`flex flex-col items-center gap-1 px-6 py-1 rounded-md ${
            section === "investments" ? "text-primary" : "text-muted-foreground"
          }`}
          onClick={() => onChange("investments")}
        >
          <Home className="h-5 w-5" />
          <span className="text-xs">Investments</span>
        </button>
      </div>
    </nav>
  );
}

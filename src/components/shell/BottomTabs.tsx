"use client";
import { PieChart, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

export type Section = "summary" | "investments";

const TABS: { id: Section; label: string; Icon: typeof PieChart }[] = [
  { id: "summary", label: "Dashboard", Icon: PieChart },
  { id: "investments", label: "Investments", Icon: Wallet },
];

export default function BottomTabs({
  section,
  onChange,
}: {
  section: Section;
  onChange: (s: Section) => void;
}) {
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 md:hidden border-t border-border bg-background/85 backdrop-blur-lg"
      style={{ paddingBottom: "calc(22px + env(safe-area-inset-bottom))" }}
      aria-label="Primary"
      role="tablist"
    >
      <div className="grid grid-cols-2 pt-2">
        {TABS.map(({ id, label, Icon }) => {
          const active = section === id;
          return (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={active}
              aria-label={label}
              className={cn(
                "relative flex h-12 flex-col items-center justify-center gap-[3px] transition-colors",
                active ? "text-primary" : "text-muted-foreground",
              )}
              onClick={() => onChange(id)}
            >
              {active && (
                <span
                  aria-hidden
                  className="absolute -top-2 h-[2px] w-7 rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary))]"
                />
              )}
              <Icon size={22} strokeWidth={1.8} />
              <span className="text-[11px] font-bold leading-none">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

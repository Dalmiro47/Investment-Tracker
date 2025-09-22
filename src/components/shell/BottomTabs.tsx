"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Home, List, PieChart } from "lucide-react";

type Section = "dashboard" | "list" | "summary";

function useSection() {
  const router = useRouter();
  const sp = useSearchParams();
  const current = (sp.get("section") as Section) || "dashboard";

  const setSection = React.useCallback((next: Section) => {
    const url = new URL(window.location.href);
    url.searchParams.set("section", next);
    // replace (not push) to keep history tidy
    router.replace(url.pathname + "?" + url.searchParams.toString(), { scroll: false });
  }, [router]);

  return { section: current, setSection };
}

export function BottomTabs() {
  const { section, setSection } = useSection();

  const btn = (id: Section, label: string, icon?: React.ReactNode) => (
    <button
      key={id}
      onClick={() => setSection(id)}
      className={[
        "flex flex-col items-center justify-center flex-1 py-2 text-xs",
        section === id ? "text-primary" : "text-muted-foreground"
      ].join(" ")}
      role="tab"
      aria-selected={section === id}
      aria-current={section === id ? "page" : undefined}
    >
      {icon}
      <span className="mt-1">{label}</span>
    </button>
  );

  const items = [
    { id: "dashboard", label: "Dashboard", icon: <Home className="size-5" /> },
    { id: "list", label: "List", icon: <List className="size-5" /> },
    { id: "summary", label: "Summary", icon: <PieChart className="size-5" /> },
  ];

  return (
    <nav 
        aria-label="Primary"
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom))" }}>
      <div className="mx-auto flex max-w-screen-sm">
        {items.map(item => btn(item.id as Section, item.label, item.icon))}
      </div>
    </nav>
  );
}

"use client";

import * as React from "react";
import { Home, List, Clock } from "lucide-react";

type Section = "dashboard" | "list" | "summary";

type Props = {
  section: Section;
  onChange: (s: Section) => void;
};

export default function BottomTabs({ section, onChange }: Props) {
  const makeBtn = (
    key: Section,
    label: string,
    Icon: React.ComponentType<any>
  ) => {
    const selected = section === key;
    return (
      <button
        key={key}
        type="button"
        role="tab"
        aria-selected={selected}
        aria-label={label}
        className={`flex flex-col items-center justify-center flex-1 py-2
          ${selected ? "text-primary" : "text-muted-foreground"}
        `}
        onClick={() => onChange(key)}
      >
        <Icon className="h-5 w-5" />
        <span className="text-xs mt-1">{label}</span>
      </button>
    );
  };

  return (
    <nav
      role="tablist"
      aria-label="Main sections"
      className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto max-w-screen-sm grid grid-cols-3">
        {makeBtn("dashboard", "Dashboard", Home)}
        {makeBtn("list", "List", List)}
        {makeBtn("summary", "Summary", Clock)}
      </div>
    </nav>
  );
}

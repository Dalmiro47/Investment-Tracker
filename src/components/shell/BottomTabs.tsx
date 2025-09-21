"use client";
import Link from "next/link";
import { Home, List, PieChart } from "lucide-react";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", icon: Home, label: "Dashboard" },
  { href: "/list", icon: List, label: "List" },
  { href: "/summary", icon: PieChart, label: "Summary" },
];

export function BottomTabs() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 md:hidden border-t border-border
      bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="mx-auto grid max-w-[430px] grid-cols-3">
        {items.map(({ href, icon: Icon, label }) => {
          const active = path === href || path?.startsWith(href + "/");
          return (
            <Link key={href} href={href} className="flex flex-col items-center py-2 gap-1">
              <Icon className={`size-5 ${active ? "text-primary" : "text-muted-foreground"}`} />
              <span className={`text-xs ${active ? "text-primary" : "text-muted-foreground"}`}>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

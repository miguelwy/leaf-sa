"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { segment: "", label: "Overview" },
  { segment: "opportunities", label: "Opportunities" },
  { segment: "discovery", label: "Discovery", keepOpp: true },
  { segment: "stack", label: "Technology Stack" },
  { segment: "solution-fit", label: "Solution Fit", keepOpp: true },
  { segment: "architecture", label: "Architecture", keepOpp: true },
  { segment: "meetings", label: "Meetings" },
  { segment: "notes", label: "SA Notes" },
  { segment: "actions", label: "Action Items" },
  { segment: "history", label: "History" },
] as const;

export function AccountTabs({ accountId }: { accountId: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const base = `/accounts/${accountId}`;
  const opp = params.get("opp");

  return (
    <nav className="-mx-1 overflow-x-auto overflow-y-hidden border-b [scrollbar-width:none]" aria-label="Account sections">
      <ul className="flex min-w-max gap-1 px-1">
        {TABS.map((tab) => {
          const href = tab.segment ? `${base}/${tab.segment}` : base;
          const active = tab.segment ? pathname.startsWith(href) : pathname === base;
          const withOpp = "keepOpp" in tab && opp ? `${href}?opp=${opp}` : href;
          return (
            <li key={tab.label}>
              <Link
                href={withOpp}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex h-9 items-center px-2.5 text-[13px] font-medium transition-colors",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
                {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

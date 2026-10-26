"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { BrandMark } from "./brand-mark";
import { isActive, NAV_ITEMS } from "./nav";

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Main">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon className={cn("size-4 shrink-0", active ? "text-brand" : "text-muted-foreground group-hover:text-foreground")} />
            <span className="truncate">{item.label}</span>
            {item.planned && (
              <span className="ml-auto rounded border px-1 text-[10px] font-normal text-muted-foreground">{item.planned}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppSidebar({ ai }: { ai: { ready: boolean; providerLabel: string } }) {
  return (
    <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r bg-sidebar lg:flex">
      <div className="flex h-12 items-center border-b px-4">
        <Link href="/" aria-label="Dashboard">
          <BrandMark />
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <SidebarNav />
      </div>
      <Link href="/settings" className="block border-t p-3 text-[11px] leading-snug text-muted-foreground hover:bg-sidebar-accent/50">
        AI processing:{" "}
        <span className={cn("font-medium", ai.ready ? "text-brand" : "text-foreground")}>{ai.ready ? "On" : "Off"}</span>
        <br />
        {ai.ready ? `Transcripts you analyze are sent to ${ai.providerLabel}.` : "No customer data leaves this deployment."}
      </Link>
    </aside>
  );
}

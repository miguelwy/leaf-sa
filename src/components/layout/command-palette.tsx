"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Briefcase, Building2, CalendarClock, FileText, ListChecks, Loader2, Target, User } from "lucide-react";
import type { SearchResult, SearchResultType } from "@/domain/search";
import { SEARCH_TYPE_LABELS } from "@/domain/search";
import { api } from "@/lib/api";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { NAV_ITEMS } from "./nav";

const TYPE_ICON: Record<SearchResultType, React.ComponentType<{ className?: string }>> = {
  account: Building2,
  opportunity: Target,
  meeting: CalendarClock,
  note: FileText,
  action_item: ListChecks,
  account_executive: Briefcase,
  contact: User,
};

export function useDebounced<T>(value: T, delay = 200): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  // Results are keyed by the query they answer, so stale responses are never shown.
  const [response, setResponse] = React.useState<{ q: string; results: SearchResult[] }>({ q: "", results: [] });
  const debounced = useDebounced(query.trim(), 200);
  const loading = !!debounced && response.q !== debounced;
  const results = debounced && response.q === debounced ? response.results : [];

  React.useEffect(() => {
    if (!debounced) return;
    let cancelled = false;
    api<SearchResult[]>("GET", `/api/search?q=${encodeURIComponent(debounced)}&limit=5`)
      .then((r) => !cancelled && setResponse({ q: debounced, results: r }))
      .catch(() => !cancelled && setResponse({ q: debounced, results: [] }));
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const go = (href: string) => {
    onOpenChange(false);
    setQuery("");
    router.push(href);
  };

  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.type] ??= []).push(r);
    return acc;
  }, {});

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search" description="Search accounts, opportunities, notes and more">
      <Command shouldFilter={false}>
        <CommandInput placeholder="Search accounts, opportunities, notes…" value={query} onValueChange={setQuery} />
        <CommandList>
          {debounced && !loading && results.length === 0 && <CommandEmpty>No results for “{debounced}”.</CommandEmpty>}
          {loading && (
            <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Searching…
            </div>
          )}
          {Object.entries(grouped).map(([type, items]) => {
            const Icon = TYPE_ICON[type as SearchResultType];
            return (
              <CommandGroup key={type} heading={SEARCH_TYPE_LABELS[type as SearchResultType]}>
                {items.map((r) => (
                  <CommandItem key={`${r.type}-${r.id}`} value={`${r.type}-${r.id}`} onSelect={() => go(r.href)}>
                    <Icon className="size-4 text-muted-foreground" />
                    <span className="truncate">{r.title}</span>
                    {r.subtitle && <span className="ml-auto truncate text-xs text-muted-foreground">{r.subtitle}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            );
          })}
          {debounced && results.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem value="all-results" onSelect={() => go(`/search?q=${encodeURIComponent(debounced)}`)}>
                  See all results for “{debounced}”
                </CommandItem>
              </CommandGroup>
            </>
          )}
          {!debounced && (
            <CommandGroup heading="Go to">
              {NAV_ITEMS.map((item) => (
                <CommandItem key={item.href} value={item.href} onSelect={() => go(item.href)}>
                  <item.icon className="size-4 text-muted-foreground" />
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

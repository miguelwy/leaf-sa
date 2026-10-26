import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { SEARCH_TYPE_LABELS, type SearchResult } from "@/domain/search";
import { search } from "@/server/services/search";
import { listAccountExecutiveOptions } from "@/server/services/account-executives";
import { listAccountOptions } from "@/server/services/accounts";
import { EmptyState, PageHeader } from "@/components/common/layout-primitives";
import { LocalDateTime } from "@/components/common/local-time";
import { ClearFilters, FilterSearch, FilterSelect } from "@/components/common/url-filters";
import { SearchTypeFilter } from "@/components/search/search-type-filter";
import { SetBreadcrumbs } from "@/components/layout/breadcrumbs";

export const metadata: Metadata = { title: "Search" };

type SearchParams = Promise<{ q?: string; types?: string; account?: string; ae?: string }>;

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const [accounts, aes, results] = await Promise.all([
    listAccountOptions(),
    listAccountExecutiveOptions(),
    q ? search({ q, types: sp.types, accountId: sp.account, aeId: sp.ae, limit: 25 }) : Promise.resolve([] as SearchResult[]),
  ]);

  const groups = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.type] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <SetBreadcrumbs items={[{ label: "Search" }]} />
      <PageHeader
        title="Search"
        description="Keyword search across accounts, opportunities, notes, action items, contacts and AEs. Semantic search arrives with the AI Copilot."
      />
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <FilterSearch placeholder="Search everything…" className="w-full max-w-md" />
          <FilterSelect param="account" label="Accounts" options={accounts.map((a) => ({ value: a.id, label: a.name }))} />
          <FilterSelect param="ae" label="AEs" options={aes.map((a) => ({ value: a.id, label: a.name }))} />
          <ClearFilters params={["q", "types", "account", "ae"]} />
        </div>
        <SearchTypeFilter />
      </div>

      {!q ? (
        <EmptyState icon={Search} title="Type to search" description="Tip: press Ctrl+K anywhere for quick search." />
      ) : results.length === 0 ? (
        <EmptyState icon={Search} title={`No results for “${q}”`} description="Try fewer words or remove a filter." />
      ) : (
        <div className="space-y-5">
          {Object.entries(groups).map(([type, items]) => (
            <section key={type} className="space-y-2">
              <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                {SEARCH_TYPE_LABELS[type as keyof typeof SEARCH_TYPE_LABELS]} ({items.length})
              </h2>
              <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
                {items.map((r) => (
                  <li key={r.id}>
                    <Link href={r.href} className="block px-4 py-3 hover:bg-muted/50">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-sm font-medium">{r.title}</span>
                        {r.updatedAt && (
                          <span className="shrink-0 text-xs text-muted-foreground">
                            <LocalDateTime value={r.updatedAt} relative />
                          </span>
                        )}
                      </div>
                      {r.subtitle && <p className="truncate text-xs text-muted-foreground">{r.subtitle}</p>}
                      {r.snippet && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{r.snippet}</p>}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

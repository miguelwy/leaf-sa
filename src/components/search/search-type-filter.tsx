"use client";

import { SEARCH_TYPES, SEARCH_TYPE_LABELS, type SearchResultType } from "@/domain/search";
import { cn } from "@/lib/utils";
import { useUrlFilters } from "@/components/common/url-filters";

/** Toggle chips for document types; none selected means all types. */
export function SearchTypeFilter() {
  const { params, set } = useUrlFilters();
  const selected = new Set((params.get("types") ?? "").split(",").filter(Boolean) as SearchResultType[]);
  const toggle = (t: SearchResultType) => {
    const next = new Set(selected);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    set("types", next.size ? [...next].join(",") : null);
  };
  return (
    <div className="flex flex-wrap gap-1">
      {SEARCH_TYPES.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => toggle(t)}
          className={cn(
            "h-7 rounded-md border px-2 text-xs transition-colors",
            selected.has(t) ? "border-brand/40 bg-brand-subtle text-brand" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {SEARCH_TYPE_LABELS[t]}
        </button>
      ))}
    </div>
  );
}

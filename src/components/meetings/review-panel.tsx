"use client";

import * as React from "react";
import { CheckCheck, Inbox } from "lucide-react";
import { toast } from "sonner";
import type { Suggestion, SuggestionType } from "@/domain/meetings";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useApiAction } from "@/hooks/use-api-action";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/layout-primitives";
import { SuggestionCard } from "./suggestion-card";

const SECTIONS: { type: SuggestionType; title: string }[] = [
  { type: "action_item", title: "Action items" },
  { type: "champion", title: "Technical champions" },
  { type: "feature", title: "MongoDB features" },
  // From analyses made before the simplification:
  { type: "discovery", title: "Key notes" },
  { type: "solution_fit", title: "MongoDB features (earlier analysis)" },
  { type: "contact", title: "Contacts" },
  { type: "classification", title: "Classification" },
];

type Filter = "pending" | "approved" | "rejected" | "all";

const isClean = (s: Suggestion) => s.status === "pending" && !s.conflict && !s.blocker;

export function ReviewPanel({
  analysisId,
  suggestions,
  opportunities,
  activeId,
  onSelect,
}: {
  analysisId: string;
  suggestions: Suggestion[];
  opportunities: { id: string; name: string }[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const counts = {
    pending: suggestions.filter((s) => s.status === "pending").length,
    approved: suggestions.filter((s) => s.status === "approved").length,
    rejected: suggestions.filter((s) => s.status === "rejected").length,
    all: suggestions.length,
  };
  const [filter, setFilter] = React.useState<Filter>(counts.pending ? "pending" : "all");
  const { run, pending } = useApiAction();
  const clean = suggestions.filter(isClean);
  const visible = suggestions.filter((s) => filter === "all" || s.status === filter);

  const bulk = (ids: string[], action: "approve" | "reject") =>
    run(async () => {
      const res = await api<{ applied: number; skipped: number; errors: string[] }>("POST", `/api/analyses/${analysisId}/bulk`, {
        action,
        suggestionIds: ids,
      });
      if (res.errors.length) toast.error(res.errors.slice(0, 3).join("\n"));
      toast.success(`${res.applied} ${action === "approve" ? "applied" : "rejected"}${res.skipped ? ` · ${res.skipped} need individual review` : ""}`);
      return res;
    });

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg bg-muted p-0.5">
          {(["pending", "approved", "rejected", "all"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                filter === f ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f} <span className="tabular-nums opacity-70">{counts[f]}</span>
            </button>
          ))}
        </div>
        {counts.pending > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {clean.length > 0 && (
              <Button disabled={pending} onClick={() => bulk(clean.map((s) => s.id), "approve")}>
                <CheckCheck className="size-4" /> Approve all ({clean.length})
              </Button>
            )}
          </div>
        )}
      </div>
      {counts.pending > clean.length && (
        <p className="text-xs text-muted-foreground">
          {counts.pending - clean.length} item(s) need a decision on their own — “Approve all” skips them.
        </p>
      )}

      {visible.length === 0 ? (
        <EmptyState compact icon={Inbox} title={filter === "pending" ? "Nothing left to review" : "No suggestions here"} />
      ) : (
        SECTIONS.map(({ type, title }) => {
          const items = visible.filter((s) => s.type === type);
          if (!items.length) return null;
          return (
            <div key={type} className="space-y-2">
              <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                {title} ({items.length})
              </h3>
              {items.map((s) => (
                <SuggestionCard
                  key={s.id}
                  analysisId={analysisId}
                  suggestion={s}
                  opportunities={opportunities}
                  active={activeId === s.id}
                  onSelect={() => onSelect(s.id)}
                />
              ))}
            </div>
          );
        })
      )}
    </section>
  );
}

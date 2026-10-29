"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Check, ListChecks, MessageSquareQuote, Trash2 } from "lucide-react";
import type { ActionItemListItem } from "@/domain/entities";
import { api } from "@/lib/api";
import { daysUntil, formatDateOnly } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useApiAction } from "@/hooks/use-api-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/common/badges";
import { EmptyState, Panel } from "@/components/common/layout-primitives";
import { ActionItemFormDialog } from "@/components/action-items/action-item-form-dialog";

/** Open action items with one-line add and one-click completion. */
export function ActionItemsPanel({ accountId, items }: { accountId: string; items: ActionItemListItem[] }) {
  const { run, pending } = useApiAction();
  const [title, setTitle] = React.useState("");
  const [owner, setOwner] = React.useState("");
  const [due, setDue] = React.useState("");
  const [editing, setEditing] = React.useState<ActionItemListItem | null>(null);

  const add = async () => {
    if (!title.trim()) return;
    const ok = await run(() =>
      api("POST", "/api/action-items", { title: title.trim(), owner: owner.trim() || null, dueDate: due || null, accountId }),
    );
    if (ok !== undefined) {
      setTitle("");
      setOwner("");
      setDue("");
    }
  };

  return (
    <Panel
      title={`Action items (${items.length} open)`}
      actions={
        <Button asChild variant="ghost" size="sm">
          <Link href={`/action-items?account=${accountId}&status=all`}>
            History <ArrowRight className="size-4" />
          </Link>
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void add()}
            placeholder="New action item… (Enter to add)"
            className="h-10 min-w-64 flex-1"
          />
          <Input value={owner} onChange={(e) => setOwner(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void add()} placeholder="Owner" className="h-10 w-36" />
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-10 w-44" aria-label="Due date" />
          <Button className="h-10" onClick={add} disabled={pending || !title.trim()}>
            Add
          </Button>
        </div>

        {items.length === 0 ? (
          <EmptyState compact icon={ListChecks} title="Nothing open" />
        ) : (
          <ul className="divide-y rounded-lg border">
            {items.map((t) => {
              const days = daysUntil(t.dueDate);
              return (
                <li key={t.id} className="group flex items-center gap-3 px-3 py-2.5">
                  <button
                    type="button"
                    aria-label="Mark as done"
                    onClick={() => run(() => api("PATCH", `/api/action-items/${t.id}`, { status: "done" }), { success: "Done" })}
                    className="flex size-6 shrink-0 items-center justify-center rounded-md border-2 border-input hover:border-success hover:bg-success-subtle"
                  >
                    <Check className="size-3.5 text-success opacity-0 group-hover:opacity-60" />
                  </button>
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing(t)}>
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-medium">{t.title}</span>
                      {t.source.kind === "meeting" && <MessageSquareQuote className="size-4 shrink-0 text-info" aria-label="From a meeting" />}
                    </span>
                    {(t.owner || t.opportunityName) && (
                      <span className="block truncate text-sm text-muted-foreground">{[t.owner, t.opportunityName].filter(Boolean).join(" · ")}</span>
                    )}
                  </button>
                  {t.status === "blocked" && <Pill tone="danger">Blocked</Pill>}
                  {t.dueDate && (
                    <span className={cn("shrink-0 text-sm tabular-nums", days !== null && days < 0 ? "font-semibold text-destructive" : "text-muted-foreground")}>
                      {days !== null && days < 0 ? "Overdue · " : ""}
                      {formatDateOnly(t.dueDate, "MMM d")}
                    </span>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 opacity-0 group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
                    aria-label="Delete"
                    onClick={() => run(() => api("DELETE", `/api/action-items/${t.id}`))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <ActionItemFormDialog item={editing ?? undefined} open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} />
    </Panel>
  );
}

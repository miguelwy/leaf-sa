"use client";

import * as React from "react";
import { MoreHorizontal, Pencil, Plus, Target, Trash2 } from "lucide-react";
import type { OpportunityListItem } from "@/domain/entities";
import { api } from "@/lib/api";
import { formatDateOnly } from "@/lib/format";
import { useApiAction } from "@/hooks/use-api-action";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Pill } from "@/components/common/badges";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState, Panel } from "@/components/common/layout-primitives";
import { OpportunityFormDialog } from "@/components/opportunities/opportunity-form-dialog";

export function OpportunitiesPanel({ accountId, accountAeId, opportunities }: { accountId: string; accountAeId: string | null; opportunities: OpportunityListItem[] }) {
  const { run } = useApiAction();
  const [editing, setEditing] = React.useState<OpportunityListItem | "new" | null>(null);

  return (
    <Panel
      title="Opportunities"
      actions={
        <Button variant="outline" size="sm" onClick={() => setEditing("new")}>
          <Plus className="size-4" /> Add
        </Button>
      }
    >
      {opportunities.length === 0 ? (
        <EmptyState compact icon={Target} title="No opportunities" />
      ) : (
        <ul className="space-y-2">
          {opportunities.map((o) => (
            <li key={o.id} className="flex items-start gap-3 rounded-lg border p-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{o.name}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {o.salesMotion && <Pill tone="brand">{o.salesMotion}</Pill>}
                  {o.stage && <Pill>{o.stage}</Pill>}
                </div>
                {o.nextMilestone.title && (
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    Next: {o.nextMilestone.title}
                    {o.nextMilestone.dueDate && ` · ${formatDateOnly(o.nextMilestone.dueDate)}`}
                  </p>
                )}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${o.name}`}>
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setEditing(o)}>
                    <Pencil className="size-4" /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <ConfirmDialog
                    title={`Delete “${o.name}”?`}
                    description="Notes and action items linked to it stay on the account."
                    confirmLabel="Delete"
                    onConfirm={() => run(() => api("DELETE", `/api/opportunities/${o.id}`), { success: "Deleted" })}
                    trigger={
                      <DropdownMenuItem variant="destructive" onSelect={(e) => e.preventDefault()}>
                        <Trash2 className="size-4" /> Delete
                      </DropdownMenuItem>
                    }
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}
      <OpportunityFormDialog
        accountId={accountId}
        accountAeId={accountAeId}
        opportunity={editing && editing !== "new" ? editing : undefined}
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
      />
    </Panel>
  );
}

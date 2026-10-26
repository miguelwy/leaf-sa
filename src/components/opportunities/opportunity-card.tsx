"use client";

import * as React from "react";
import Link from "next/link";
import { Compass, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { completeness } from "@/domain/discovery";
import type { OpportunityListItem } from "@/domain/entities";
import { api } from "@/lib/api";
import { formatDateOnly } from "@/lib/format";
import { useApiAction } from "@/hooks/use-api-action";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ClassificationPills, Pill, PriorityPill } from "@/components/common/badges";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { DefinitionList } from "@/components/common/layout-primitives";
import { Markdown } from "@/components/common/markdown";
import { useReferenceData } from "@/components/common/reference-data";
import { OpportunityFormDialog } from "./opportunity-form-dialog";

export function OpportunityCard({ opportunity: o, aeName }: { opportunity: OpportunityListItem; aeName: string | null }) {
  const { enumerations } = useReferenceData();
  const [editing, setEditing] = React.useState(false);
  const { run } = useApiAction();
  const business = completeness(o.discovery, ["business"]);
  const technical = completeness(o.discovery, ["technical"]);

  return (
    <article id={o.id} className="scroll-mt-20 rounded-xl border bg-card shadow-xs target:ring-2 target:ring-brand/40">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0 space-y-1.5">
          <h3 className="truncate text-sm font-semibold">{o.name}</h3>
          <div className="flex flex-wrap items-center gap-1">
            <ClassificationPills salesMotion={o.salesMotion} tigerRoute={o.tigerRoute} stage={o.stage} />
            <PriorityPill priority={o.businessPriority} priorities={enumerations.priorities} />
            {o.technicalComplexity && <Pill title="Technical complexity">{o.technicalComplexity} complexity</Pill>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button asChild variant="outline" size="sm">
            <Link href={`/accounts/${o.accountId}/discovery?opp=${o.id}`}>
              <Compass className="size-3.5" /> Discovery
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7" aria-label="Opportunity actions">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditing(true)}>
                <Pencil className="size-4" /> Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <ConfirmDialog
                title={`Delete “${o.name}”?`}
                description="Its workloads, discovery, solution fit and architecture are deleted. Notes and action items stay on the account, unlinked."
                confirmLabel="Delete opportunity"
                onConfirm={() => run(() => api("DELETE", `/api/opportunities/${o.id}`), { success: "Opportunity deleted" })}
                trigger={
                  <DropdownMenuItem variant="destructive" onSelect={(e) => e.preventDefault()}>
                    <Trash2 className="size-4" /> Delete
                  </DropdownMenuItem>
                }
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <div className="grid gap-4 p-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {o.description ? (
            <Markdown className="text-muted-foreground">{o.description}</Markdown>
          ) : (
            <p className="text-sm text-muted-foreground">No description.</p>
          )}
        </div>
        <DefinitionList
          className="sm:grid-cols-1"
          items={[
            { label: "Account Executive", value: aeName ?? "Unassigned" },
            { label: "Estimated timeline", value: o.estimatedTimeline },
            { label: "Expected workload", value: o.expectedWorkload },
            {
              label: "Next milestone",
              value: o.nextMilestone.title
                ? `${o.nextMilestone.title}${o.nextMilestone.dueDate ? ` · ${formatDateOnly(o.nextMilestone.dueDate)}` : ""}`
                : null,
            },
            {
              label: "Confirmed discovery",
              value: `Business ${business.filled}/${business.total} · Technical ${technical.filled}/${technical.total}`,
            },
          ]}
        />
      </div>
      <OpportunityFormDialog accountId={o.accountId} opportunity={o} open={editing} onOpenChange={setEditing} />
    </article>
  );
}

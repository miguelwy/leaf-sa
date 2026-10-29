"use client";

import * as React from "react";
import { AlertTriangle, Check, CheckCheck, Compass, Leaf, Lightbulb, ListChecks, Pencil, Quote, RotateCcw, Star, Tags, UserPlus, X } from "lucide-react";
import type { Suggestion, SuggestionDecision, SuggestionType } from "@/domain/meetings";
import { api } from "@/lib/api";
import { formatDateOnly } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useApiAction } from "@/hooks/use-api-action";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const TYPE_ICON: Record<SuggestionType, React.ComponentType<{ className?: string }>> = {
  action_item: ListChecks,
  champion: Star,
  feature: Leaf,
  discovery: Compass,
  classification: Tags,
  solution_fit: Lightbulb,
  contact: UserPlus,
};

/** Extra fields shown under the value, per suggestion type. */
const DETAIL_ROWS: Partial<Record<SuggestionType, [label: string, key: string][]>> = {
  action_item: [
    ["Owner", "owner"],
    ["Due", "dueDate"],
  ],
  champion: [
    ["Title", "title"],
    ["Why", "role"],
  ],
  feature: [["Why", "why"]],
  solution_fit: [
    ["Problem", "problem"],
    ["Why", "justification"],
  ],
  classification: [["Rationale", "rationale"]],
  contact: [["Title", "title"]],
};

function Details({ s }: { s: Suggestion }) {
  const rows = (DETAIL_ROWS[s.type] ?? [])
    .map(([label, key]) => [label, key === "dueDate" && s.details.dueDate ? formatDateOnly(s.details.dueDate) : s.details[key]] as const)
    .filter(([, v]) => v);
  if (!rows.length) return null;
  return (
    <dl className="grid gap-1 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2">
          <dt className="text-muted-foreground">{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SuggestionCard({
  analysisId,
  suggestion: s,
  opportunities,
  active,
  onSelect,
}: {
  analysisId: string;
  suggestion: Suggestion;
  opportunities: { id: string; name: string }[];
  active: boolean;
  onSelect: () => void;
}) {
  const { run, pending } = useApiAction();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(s.value);
  const [oppId, setOppId] = React.useState<string | null>(null);
  const Icon = TYPE_ICON[s.type];
  // Only legacy classification suggestions still need an opportunity choice.
  const needsOpp = s.type === "classification" && !s.opportunityId;

  const decide = (decision: SuggestionDecision, success?: string) =>
    run(() => api("POST", `/api/analyses/${analysisId}/suggestions/${s.id}`, decision), { success }).then((r) => {
      if (r !== undefined) setEditing(false);
    });

  const approve = () =>
    decide({ action: "approve", value: draft.trim() !== s.value ? draft.trim() : undefined, opportunityId: oppId ?? undefined }, "Added to the account");

  return (
    <article
      id={`sg-${s.id}`}
      onClick={onSelect}
      className={cn(
        "scroll-mt-20 rounded-xl border bg-card p-4 transition-shadow",
        active && "ring-2 ring-brand/50",
        s.status === "approved" && "border-success/30 bg-success-subtle/40",
        s.status === "rejected" && "opacity-55",
      )}
    >
      <header className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4" />
        <span className="font-medium">{s.label}</span>
        {s.existingValue && <span className="truncate">· {s.existingValue}</span>}
      </header>

      <div className="mt-2 space-y-2">
        {editing ? (
          <Textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onClick={(e) => e.stopPropagation()} rows={2} className="text-base" />
        ) : (
          <p className="text-base font-semibold whitespace-pre-wrap">{s.editedValue ?? draft}</p>
        )}
        <Details s={s} />

        {s.evidence.excerpt && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            className="flex w-full gap-2 rounded-lg border-l-2 border-warning/60 bg-warning-subtle/40 px-3 py-2 text-left text-sm text-muted-foreground hover:bg-warning-subtle"
            title={s.evidence.start === null ? "Quote not found verbatim in the transcript" : "Show in transcript"}
          >
            <Quote className="mt-0.5 size-3.5 shrink-0" />
            <span>
              “{s.evidence.excerpt}”{s.evidence.speaker && ` — ${s.evidence.speaker}`}
            </span>
          </button>
        )}

        {s.status === "pending" && s.conflict && (
          <p className="flex items-start gap-1.5 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Changes the current value ({s.existingValue}).
          </p>
        )}
        {s.status === "pending" && s.blocker && !(needsOpp && oppId) && (
          <p className="flex items-start gap-1.5 text-sm text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {s.blocker}
          </p>
        )}
        {s.status === "pending" && needsOpp && (
          <Select value={oppId ?? undefined} onValueChange={setOppId}>
            <SelectTrigger className="w-full" onClick={(e) => e.stopPropagation()}>
              <SelectValue placeholder="Choose opportunity…" />
            </SelectTrigger>
            <SelectContent>
              {opportunities.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <footer className="mt-3 flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {s.status === "approved" && (
          <span className="flex items-center gap-1.5 text-sm font-medium text-success">
            <CheckCheck className="size-4" /> Added
          </span>
        )}
        {s.status === "rejected" && (
          <>
            <span className="text-sm text-muted-foreground">Rejected</span>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => decide({ action: "reset" })}>
              <RotateCcw className="size-3.5" /> Undo
            </Button>
          </>
        )}
        {s.status === "pending" && (
          <>
            <Button disabled={pending || (needsOpp && !oppId)} onClick={approve}>
              <Check className="size-4" /> Approve
            </Button>
            <Button variant="outline" disabled={pending} onClick={() => setEditing((v) => !v)}>
              <Pencil className="size-4" /> {editing ? "Done" : "Edit"}
            </Button>
            <Button variant="ghost" className="text-muted-foreground" disabled={pending} onClick={() => decide({ action: "reject" })}>
              <X className="size-4" /> Reject
            </Button>
          </>
        )}
      </footer>
    </article>
  );
}

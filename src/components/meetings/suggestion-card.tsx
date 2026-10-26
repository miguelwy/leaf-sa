"use client";

import * as React from "react";
import { AlertTriangle, Check, CheckCheck, Lightbulb, ListChecks, Pencil, Quote, RotateCcw, Tags, UserPlus, X, Compass } from "lucide-react";
import type { Relation, Suggestion, SuggestionDecision, SuggestionType } from "@/domain/meetings";
import { api } from "@/lib/api";
import { formatDateOnly } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useApiAction } from "@/hooks/use-api-action";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Pill, type Tone } from "@/components/common/badges";

const TYPE_ICON: Record<SuggestionType, React.ComponentType<{ className?: string }>> = {
  discovery: Compass,
  classification: Tags,
  action_item: ListChecks,
  solution_fit: Lightbulb,
  contact: UserPlus,
};

const RELATION: Record<Relation, { label: string; tone: Tone }> = {
  new: { label: "New", tone: "brand" },
  confirms: { label: "Confirms", tone: "success" },
  updates: { label: "Updates", tone: "info" },
  conflicts: { label: "Conflicts", tone: "danger" },
  resolves: { label: "Resolves question", tone: "success" },
};

const CONFIDENCE_TONE: Record<Suggestion["confidence"], Tone> = { high: "success", medium: "neutral", low: "warning" };
const KIND_LABEL: Record<Suggestion["kind"], string> = { fact: "Stated", interpretation: "Interpretation", recommendation: "Recommendation" };

function Details({ s }: { s: Suggestion }) {
  const rows: [string, string | null | undefined][] =
    s.type === "action_item"
      ? [
          ["Owner", s.details.owner],
          ["Due", s.details.dueDate ? formatDateOnly(s.details.dueDate) : null],
        ]
      : s.type === "solution_fit"
        ? [
            ["Customer problem", s.details.problem],
            ["Justification", s.details.justification],
          ]
        : s.type === "classification"
          ? [["Rationale", s.details.rationale]]
          : s.type === "contact"
            ? [
                ["Title", s.details.title],
                ["Persona", s.details.persona],
              ]
            : [];
  const shown = rows.filter(([, v]) => v);
  if (!shown.length) return null;
  return (
    <dl className="grid gap-1 text-xs">
      {shown.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
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
  const oppName = opportunities.find((o) => o.id === (oppId ?? s.opportunityId))?.name;
  const needsOpp = s.scope === "opportunity" && !s.opportunityId && (s.type !== "action_item");
  const listConflict = s.type === "discovery" && s.conflict && !!s.relatedItemId;

  const decide = (decision: SuggestionDecision, success?: string) =>
    run(() => api("POST", `/api/analyses/${analysisId}/suggestions/${s.id}`, decision), { success }).then((r) => {
      if (r !== undefined) setEditing(false);
    });

  const approve = (resolution?: "replace" | "add") =>
    decide(
      {
        action: "approve",
        value: editing || draft !== s.value ? draft.trim() : undefined,
        resolution,
        opportunityId: oppId ?? undefined,
      },
      "Applied to the account",
    );

  const reviewed = s.status !== "pending";

  return (
    <article
      id={`sg-${s.id}`}
      onClick={onSelect}
      className={cn(
        "scroll-mt-20 rounded-lg border bg-card p-3 transition-shadow",
        active && "ring-2 ring-brand/50",
        s.status === "approved" && "border-success/30 bg-success-subtle/40",
        s.status === "rejected" && "opacity-60",
      )}
    >
      <header className="flex flex-wrap items-center gap-1.5">
        <Icon className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold">{s.label}</span>
        <span className="text-[11px] text-muted-foreground">· {s.scope === "account" ? "Account" : (oppName ?? "No opportunity")}</span>
        <span className="ml-auto flex flex-wrap gap-1">
          <Pill tone={RELATION[s.relation].tone}>{RELATION[s.relation].label}</Pill>
          <Pill tone={CONFIDENCE_TONE[s.confidence]} title="Confidence">
            {s.confidence}
          </Pill>
          <Pill title="Statement type">{KIND_LABEL[s.kind]}</Pill>
        </span>
      </header>

      <div className="mt-2 space-y-2">
        {s.existingValue && (
          <div className="rounded-md border border-dashed px-2.5 py-1.5">
            <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Current</p>
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">{s.existingValue}</p>
          </div>
        )}
        <div className="rounded-md bg-muted/40 px-2.5 py-1.5">
          <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">{s.existingValue ? "Suggested" : "Value"}</p>
          {editing ? (
            <Textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              rows={3}
              className="mt-1 min-h-0 bg-background text-sm"
            />
          ) : (
            <p className="text-sm font-medium whitespace-pre-wrap">{s.editedValue ?? (draft !== s.value ? draft : s.value)}</p>
          )}
        </div>
        <Details s={s} />

        {s.evidence.excerpt && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            className="flex w-full gap-2 rounded-md border-l-2 border-warning/60 bg-warning-subtle/40 px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:bg-warning-subtle"
            title={s.evidence.start === null ? "Quote not found verbatim in the transcript" : "Show in transcript"}
          >
            <Quote className="mt-0.5 size-3 shrink-0" />
            <span>
              “{s.evidence.excerpt}”{s.evidence.speaker && <span className="not-italic"> — {s.evidence.speaker}</span>}
              {s.evidence.start === null && <span className="ml-1 text-warning">(not found verbatim)</span>}
            </span>
          </button>
        )}

        {s.conflict && s.status === "pending" && (
          <p className="flex items-start gap-1.5 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            {s.type === "discovery" && !s.relatedItemId
              ? "This field already has a value. Approving replaces it."
              : s.type === "classification"
                ? "This would change the current classification."
                : "Contradicts what is recorded. Decide explicitly."}
          </p>
        )}
        {s.blocker && s.status === "pending" && !(needsOpp && oppId) && (
          <p className="flex items-start gap-1.5 text-xs text-warning">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {s.blocker}
          </p>
        )}
        {needsOpp && s.status === "pending" && (
          <Select value={oppId ?? undefined} onValueChange={setOppId}>
            <SelectTrigger size="sm" className="w-full" onClick={(e) => e.stopPropagation()}>
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

      <footer className="mt-3 flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        {s.status === "approved" && (
          <span className="flex items-center gap-1 text-xs font-medium text-success">
            <CheckCheck className="size-3.5" />
            Approved{s.resolution ? ` · ${s.resolution}` : ""}
          </span>
        )}
        {s.status === "rejected" && (
          <>
            <span className="text-xs text-muted-foreground">Rejected</span>
            <Button size="xs" variant="ghost" disabled={pending} onClick={() => decide({ action: "reset" })}>
              <RotateCcw className="size-3" /> Reopen
            </Button>
          </>
        )}
        {!reviewed && (
          <>
            {listConflict ? (
              <>
                <Button size="xs" disabled={pending} onClick={() => approve("replace")}>
                  <Check className="size-3" /> Replace current
                </Button>
                <Button size="xs" variant="outline" disabled={pending} onClick={() => approve("add")}>
                  Keep both
                </Button>
              </>
            ) : (
              <Button size="xs" disabled={pending || (needsOpp && !oppId)} onClick={() => approve()}>
                <Check className="size-3" /> {s.relation === "confirms" ? "Confirm" : "Approve"}
              </Button>
            )}
            <Button
              size="xs"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setEditing((v) => !v);
              }}
            >
              <Pencil className="size-3" /> {editing ? "Done" : "Edit"}
            </Button>
            <Button size="xs" variant="ghost" className="text-muted-foreground" disabled={pending} onClick={() => decide({ action: "reject" })}>
              <X className="size-3" /> Reject
            </Button>
          </>
        )}
      </footer>
    </article>
  );
}

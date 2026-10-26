import { History } from "lucide-react";
import type { ChangeHistoryEntry, FieldChange } from "@/domain/entities";
import { DISCOVERY_FIELD_MAP } from "@/domain/discovery";
import { listAccountHistory } from "@/server/services/history";
import { Pill, type Tone } from "@/components/common/badges";
import { EmptyState } from "@/components/common/layout-primitives";
import { LocalDateTime } from "@/components/common/local-time";
import { SetBreadcrumbs } from "@/components/layout/breadcrumbs";
import { loadAccount } from "../data";

export const metadata = { title: "History" };

const ACTION_TONE: Record<ChangeHistoryEntry["action"], Tone> = { create: "success", update: "info", delete: "danger" };
const ENTITY_LABEL: Record<ChangeHistoryEntry["entityType"], string> = {
  account: "Account",
  contact: "Contact",
  opportunity: "Opportunity",
  workload: "Workload",
  note: "Note",
  action_item: "Action item",
  meeting: "Meeting",
};

function fieldLabel(field: string): string {
  const [head, key] = field.split(".");
  if ((head === "discovery" || head === "techStack") && key) return DISCOVERY_FIELD_MAP.get(key)?.label ?? key;
  if (head === "solutionFit") return `Solution fit: ${field.slice("solutionFit.".length)}`;
  return field.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).replace(/ Id$/, "");
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.join("; ") : "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function Change({ change }: { change: FieldChange }) {
  return (
    <li className="grid gap-1 text-xs sm:grid-cols-[12rem_minmax(0,1fr)]">
      <span className="text-muted-foreground">{fieldLabel(change.field)}</span>
      <span className="min-w-0 break-words">
        <span className="text-muted-foreground line-through decoration-muted-foreground/50">{formatValue(change.from)}</span>
        <span className="mx-1.5 text-muted-foreground">→</span>
        <span>{formatValue(change.to)}</span>
      </span>
    </li>
  );
}

export default async function HistoryTab({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const account = await loadAccount(accountId);
  const entries = await listAccountHistory(accountId, 200);

  return (
    <div className="space-y-4">
      <SetBreadcrumbs items={[{ label: "Accounts", href: "/accounts" }, { label: account.name, href: `/accounts/${account.id}` }, { label: "History" }]} />
      <p className="text-sm text-muted-foreground">
        Audit trail of every change to this account and its records. Changes approved from meeting-analysis suggestions are marked as such.
      </p>
      {entries.length === 0 ? (
        <EmptyState icon={History} title="No changes recorded yet" />
      ) : (
        <ol className="relative space-y-3 border-l pl-5">
          {entries.map((e) => (
            <li key={e.id} className="relative">
              <span className="absolute top-3 -left-[25px] size-2 rounded-full border-2 border-background bg-muted-foreground/60" />
              <div className="rounded-xl border bg-card p-3 shadow-xs">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Pill tone={ACTION_TONE[e.action]}>{e.action}</Pill>
                  <span className="text-muted-foreground">{ENTITY_LABEL[e.entityType]}</span>
                  <span className="font-medium">{e.entityLabel}</span>
                  {e.actor.kind === "ai-approved" && <Pill tone="info">AI suggestion approved</Pill>}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {e.actor.name ?? "System"} · <LocalDateTime value={e.at} />
                  </span>
                </div>
                {e.changes.length > 0 && (
                  <ul className="mt-2 space-y-1 border-t pt-2">
                    {e.changes.map((c, i) => (
                      <Change key={`${c.field}-${i}`} change={c} />
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

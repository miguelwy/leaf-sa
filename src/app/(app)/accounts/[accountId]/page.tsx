import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileText, Pin } from "lucide-react";
import { completeness } from "@/domain/discovery";
import { listActionItems } from "@/server/services/action-items";
import { listContacts } from "@/server/services/contacts";
import { listNotes } from "@/server/services/notes";
import { getEnumerations } from "@/server/services/settings";
import { daysUntil, formatDateOnly } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ActionStatusPill, ClassificationPills } from "@/components/common/badges";
import { EmptyState, Panel, SectionLabel } from "@/components/common/layout-primitives";
import { LocalDateTime } from "@/components/common/local-time";
import { Markdown } from "@/components/common/markdown";
import { ContactsPanel } from "@/components/accounts/contacts-panel";
import { SetBreadcrumbs } from "@/components/layout/breadcrumbs";
import { Button } from "@/components/ui/button";
import { loadAccount, loadAccountOpportunities } from "./data";

type Params = Promise<{ accountId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { accountId } = await params;
  const account = await loadAccount(accountId);
  return { title: account.name };
}

export default async function AccountOverviewPage({ params }: { params: Params }) {
  const { accountId } = await params;
  // Resolve the account first so an unknown id renders not-found before other queries run.
  const account = await loadAccount(accountId);
  const [opportunities, contacts, notes, tasks, enums] = await Promise.all([
    loadAccountOpportunities(accountId),
    listContacts(accountId),
    listNotes(accountId),
    listActionItems({ accountId, status: "open" }),
    getEnumerations(),
  ]);
  const pinned = notes.filter((n) => n.pinned).slice(0, 3);
  const recentNotes = pinned.length ? pinned : notes.slice(0, 3);

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <SetBreadcrumbs items={[{ label: "Accounts", href: "/accounts" }, { label: account.name }]} />

      <div className="space-y-4 xl:col-span-2">
        <Panel title="About">
          {account.description ? (
            <Markdown>{account.description}</Markdown>
          ) : (
            <p className="text-sm text-muted-foreground">No description yet. Use “Edit account” to add one.</p>
          )}
          {account.internalNotes && (
            <div className="mt-4 space-y-2 border-t pt-4">
              <SectionLabel>Internal account notes</SectionLabel>
              <Markdown className="text-muted-foreground">{account.internalNotes}</Markdown>
            </div>
          )}
        </Panel>

        <Panel
          title="Opportunities"
          bodyClassName="p-0"
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link href={`/accounts/${account.id}/opportunities`}>
                Manage <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          }
        >
          {opportunities.length === 0 ? (
            <EmptyState compact className="m-4" title="No opportunities yet" description="Add one per initiative: each has its own motion, requirements and next steps." />
          ) : (
            <ul className="divide-y">
              {opportunities.map((o) => {
                const business = completeness(o.discovery, ["business"]);
                const technical = completeness(o.discovery, ["technical"]);
                const closed = !!o.stage && enums.closedStages.includes(o.stage);
                return (
                  <li key={o.id} className={cn("flex flex-wrap items-center gap-3 px-4 py-3", closed && "opacity-60")}>
                    <div className="min-w-0 flex-1">
                      <Link href={`/accounts/${account.id}/discovery?opp=${o.id}`} className="block truncate text-sm font-medium hover:underline">
                        {o.name}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {o.nextMilestone.title
                          ? `Next: ${o.nextMilestone.title}${o.nextMilestone.dueDate ? ` · ${formatDateOnly(o.nextMilestone.dueDate)}` : ""}`
                          : "No next milestone"}
                      </p>
                    </div>
                    <ClassificationPills salesMotion={o.salesMotion} tigerRoute={o.tigerRoute} stage={o.stage} />
                    <span className="w-36 text-right text-xs text-muted-foreground tabular-nums">
                      Discovery {business.filled + technical.filled}/{business.total + technical.total}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel
          title={pinned.length ? "Pinned notes" : "Recent notes"}
          bodyClassName="p-0"
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link href={`/accounts/${account.id}/notes`}>
                All notes <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          }
        >
          {recentNotes.length === 0 ? (
            <EmptyState compact icon={FileText} className="m-4" title="No notes yet" />
          ) : (
            <ul className="divide-y">
              {recentNotes.map((n) => (
                <li key={n.id}>
                  <Link href={`/accounts/${account.id}/notes?note=${n.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50">
                    {n.pinned ? <Pin className="size-3.5 text-brand" /> : <FileText className="size-3.5 text-muted-foreground" />}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{n.title}</span>
                    <span className="text-xs text-muted-foreground">
                      <LocalDateTime value={n.updatedAt} relative />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="space-y-4">
        <ContactsPanel accountId={account.id} contacts={contacts} />
        <Panel
          title={`Open action items (${tasks.length})`}
          bodyClassName="p-0"
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link href={`/accounts/${account.id}/actions`}>
                View <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          }
        >
          {tasks.length === 0 ? (
            <EmptyState compact className="m-4" title="Nothing open" />
          ) : (
            <ul className="divide-y">
              {tasks.slice(0, 6).map((t) => {
                const days = daysUntil(t.dueDate);
                return (
                  <li key={t.id} className="flex items-center gap-2 px-4 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                    <ActionStatusPill status={t.status} />
                    <span className={cn("w-20 text-right text-xs tabular-nums", days !== null && days < 0 ? "text-destructive" : "text-muted-foreground")}>
                      {t.dueDate ? formatDateOnly(t.dueDate, "MMM d") : "—"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

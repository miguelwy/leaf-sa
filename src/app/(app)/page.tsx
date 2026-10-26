import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Building2, CalendarClock, Flag, ListChecks, Target } from "lucide-react";
import { getDashboard, FOLLOW_UP_AFTER_DAYS, type FocusItem } from "@/server/services/dashboard";
import { listMeetings } from "@/server/services/meetings";
import { requireUser } from "@/server/auth/session";
import { formatDateOnly } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EmptyState, PageHeader, Panel, StatCard } from "@/components/common/layout-primitives";
import { LocalDateTime } from "@/components/common/local-time";
import { Pill } from "@/components/common/badges";
import { SetBreadcrumbs } from "@/components/layout/breadcrumbs";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Dashboard" };

const FOCUS_META: Record<FocusItem["kind"], { label: string; icon: typeof Flag; tone: "danger" | "warning" | "info" | "brand" }> = {
  overdue_task: { label: "Overdue", icon: AlertTriangle, tone: "danger" },
  due_task: { label: "Due", icon: ListChecks, tone: "warning" },
  meeting: { label: "Meeting", icon: CalendarClock, tone: "info" },
  milestone: { label: "Milestone", icon: Flag, tone: "brand" },
};

function BarList({ rows, href }: { rows: { label: string; count: number; key: string }[]; href?: (key: string) => string | null }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const link = href?.(r.key);
        const label = <span className="truncate">{r.label}</span>;
        return (
          <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-sm">
            <div className="relative h-7 overflow-hidden rounded-md bg-muted/60">
              <div className="absolute inset-y-0 left-0 rounded-md bg-brand/15" style={{ width: `${(r.count / max) * 100}%` }} />
              <div className="relative flex h-full items-center px-2.5">
                {link ? (
                  <Link href={link} className="truncate hover:underline">
                    {r.label}
                  </Link>
                ) : (
                  label
                )}
              </div>
            </div>
            <span className="w-6 text-right tabular-nums text-muted-foreground">{r.count}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Meter({ filled, total }: { filled: number; total: number }) {
  const pct = total ? Math.round((filled / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", pct >= 60 ? "bg-success" : pct >= 30 ? "bg-warning" : "bg-destructive/70")} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
        {filled}/{total}
      </span>
    </div>
  );
}

export default async function DashboardPage() {
  const [user, d, meetings] = await Promise.all([requireUser(), getDashboard(), listMeetings({ limit: 50 })]);
  const analyzed = meetings.filter((m) => m.latestAnalysisId).slice(0, 6);
  const firstName = user.name.split(" ")[0];

  if (d.accountTotal === 0) {
    return (
      <div className="space-y-6">
        <SetBreadcrumbs items={[{ label: "Dashboard" }]} />
        <PageHeader title={`Welcome, ${firstName}`} description="Start by organising your book of business." />
        <EmptyState
          icon={Building2}
          title="No accounts yet"
          description="Create your Account Executives, then add the accounts you cover. Opportunities, discovery, notes and action items all hang off an account."
          action={
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/account-executives">Add account executives</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/accounts">Go to accounts</Link>
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SetBreadcrumbs items={[{ label: "Dashboard" }]} />
      <PageHeader title={`Good to see you, ${firstName}`} description="What needs your attention across your accounts." />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Accounts"
          value={d.accountTotal}
          icon={Building2}
          hint={d.accountsByStatus.map((s) => `${s.count} ${s.label}`).join(" · ")}
        />
        <StatCard label="Active opportunities" value={d.activeOpportunities} icon={Target} tone="brand" hint="Excludes closed stages" />
        <StatCard
          label="Open action items"
          value={d.tasks.open}
          icon={ListChecks}
          hint={`${d.tasks.dueThisWeek} due this week · ${d.tasks.blocked} blocked`}
        />
        <StatCard
          label="Overdue"
          value={d.tasks.overdue}
          icon={AlertTriangle}
          tone={d.tasks.overdue ? "danger" : "default"}
          hint={d.tasks.overdue ? "Action items past their due date" : "Nothing overdue"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel
          title="My Focus"
          description="Overdue and upcoming tasks, meetings and milestones (next 14 days)"
          className="xl:col-span-2"
          bodyClassName="p-0"
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link href="/action-items">
                All tasks <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          }
        >
          {d.focus.length === 0 ? (
            <EmptyState compact className="m-4" title="You're clear" description="No overdue tasks, meetings or milestones in the next two weeks." />
          ) : (
            <ul className="divide-y">
              {d.focus.map((f, i) => {
                const meta = FOCUS_META[f.kind];
                const Icon = meta.icon;
                return (
                  <li key={`${f.kind}-${i}`}>
                    <Link href={f.href} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50">
                      <Icon className={cn("size-4 shrink-0", meta.tone === "danger" ? "text-destructive" : "text-muted-foreground")} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{f.title}</p>
                        {f.subtitle && <p className="truncate text-xs text-muted-foreground">{f.subtitle}</p>}
                      </div>
                      <Pill tone={meta.tone}>{meta.label}</Pill>
                      <span className="w-28 text-right text-xs tabular-nums text-muted-foreground">
                        {f.kind === "meeting" ? <LocalDateTime value={f.date} pattern="MMM d · HH:mm" /> : formatDateOnly(f.date)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Needs follow-up" description={`Active work with no interaction in ${FOLLOW_UP_AFTER_DAYS}+ days, or overdue tasks`} bodyClassName="p-0">
          {d.followUps.length === 0 ? (
            <EmptyState compact className="m-4" title="All accounts are current" />
          ) : (
            <ul className="divide-y">
              {d.followUps.map((f) => (
                <li key={f.accountId}>
                  <Link href={`/accounts/${f.accountId}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{f.name}</p>
                      <p className="text-xs text-muted-foreground">{f.reason}</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {f.lastInteractionAt ? <LocalDateTime value={f.lastInteractionAt} relative /> : "never"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Panel title="Accounts by AE">
          <BarList
            rows={d.accountsByAe.map((a) => ({ key: a.aeId ?? "none", label: a.name, count: a.count }))}
            href={(key) => (key === "none" ? null : `/account-executives/${key}`)}
          />
        </Panel>
        <Panel title="Active opportunities by sales motion">
          {d.opportunitiesByMotion.length ? (
            <BarList rows={d.opportunitiesByMotion.map((m) => ({ key: m.motion, label: m.motion, count: m.count }))} />
          ) : (
            <p className="text-sm text-muted-foreground">No active opportunities.</p>
          )}
        </Panel>
        <Panel title="Upcoming customer meetings" description="From each account's next scheduled meeting" bodyClassName="p-0">
          {d.upcomingMeetings.length === 0 ? (
            <EmptyState compact className="m-4" title="No meetings in the next 14 days" />
          ) : (
            <ul className="divide-y">
              {d.upcomingMeetings.map((m) => (
                <li key={m.accountId}>
                  <Link href={`/accounts/${m.accountId}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/50">
                    <span className="truncate text-sm font-medium">{m.accountName}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      <LocalDateTime value={m.at} pattern="EEE, MMM d · HH:mm" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Discovery completeness" description="Active opportunities with the least confirmed discovery" bodyClassName="p-0">
          {d.discovery.length === 0 ? (
            <EmptyState compact className="m-4" title="No active opportunities" />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Opportunity</th>
                  <th className="w-36 px-2 py-2 font-medium">Business</th>
                  <th className="w-36 px-4 py-2 font-medium">Technical</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {d.discovery.map((o) => (
                  <tr key={o.opportunityId} className="hover:bg-muted/50">
                    <td className="max-w-0 px-4 py-2">
                      <Link href={`/accounts/${o.accountId}/discovery?opp=${o.opportunityId}`} className="block truncate font-medium hover:underline">
                        {o.name}
                      </Link>
                      <span className="block truncate text-xs text-muted-foreground">{o.accountName}</span>
                    </td>
                    <td className="px-2 py-2">
                      <Meter {...o.business} />
                    </td>
                    <td className="px-4 py-2">
                      <Meter {...o.technical} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <Panel title="Recently updated accounts" bodyClassName="p-0">
          <ul className="divide-y">
            {d.recentAccounts.map((a) => (
              <li key={a.id}>
                <Link href={`/accounts/${a.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{a.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{a.aeName ?? "Unassigned"}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    <LocalDateTime value={a.updatedAt} relative />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel
        title="Recent meeting analyses"
        bodyClassName="p-0"
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/meetings">
              All meetings <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        }
      >
        {analyzed.length === 0 ? (
          <EmptyState compact className="m-4" title="No analyzed meetings yet" description="Add a meeting with its transcript and run the analysis." />
        ) : (
          <ul className="divide-y">
            {analyzed.map((m) => (
              <li key={m.id}>
                <Link href={`/accounts/${m.accountId}/meetings/${m.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{m.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{m.accountName}</p>
                  </div>
                  {m.pendingSuggestions > 0 ? <Pill tone="warning">{m.pendingSuggestions} to review</Pill> : <Pill tone="success">Reviewed</Pill>}
                  <span className="w-28 text-right text-xs text-muted-foreground">
                    <LocalDateTime value={m.startsAt} pattern="MMM d · HH:mm" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

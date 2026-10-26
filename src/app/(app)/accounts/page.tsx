import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import { listAccounts } from "@/server/services/accounts";
import { listAccountExecutiveOptions } from "@/server/services/account-executives";
import { getEnumerations } from "@/server/services/settings";
import { EmptyState, PageHeader } from "@/components/common/layout-primitives";
import { Pill } from "@/components/common/badges";
import { LocalDateTime } from "@/components/common/local-time";
import { ClearFilters, FilterSearch, FilterSelect } from "@/components/common/url-filters";
import { toOptions } from "@/lib/options";
import { AccountFormDialog } from "@/components/accounts/account-form-dialog";
import { SetBreadcrumbs } from "@/components/layout/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Accounts" };

type SearchParams = Promise<{ ae?: string; status?: string; motion?: string; q?: string }>;

export default async function AccountsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const [accounts, aes, enums] = await Promise.all([
    listAccounts({ aeId: sp.ae, status: sp.status, salesMotion: sp.motion, q: sp.q }),
    listAccountExecutiveOptions(),
    getEnumerations(),
  ]);
  const filtered = !!(sp.ae || sp.status || sp.motion || sp.q);

  return (
    <div className="space-y-5">
      <SetBreadcrumbs items={[{ label: "Accounts" }]} />
      <PageHeader
        title="Accounts"
        description="Your book of business. Each account is a living history of its opportunities and technical journey."
        actions={
          <AccountFormDialog
            trigger={
              <Button size="sm">
                <Plus className="size-3.5" /> New account
              </Button>
            }
          />
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <FilterSearch placeholder="Filter by name…" />
        <FilterSelect param="ae" label="AEs" options={aes.map((a) => ({ value: a.id, label: a.name }))} />
        <FilterSelect param="status" label="Statuses" options={toOptions(enums.accountStatuses)} className="w-36" />
        <FilterSelect param="motion" label="Sales motions" options={toOptions(enums.salesMotions)} />
        <ClearFilters params={["ae", "status", "motion", "q"]} />
      </div>

      {accounts.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={filtered ? "No accounts match these filters" : "No accounts yet"}
          description={filtered ? "Try clearing a filter." : "Create your first account to start capturing discovery and notes."}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Account</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Account Executive</TableHead>
                <TableHead>Opportunities</TableHead>
                <TableHead className="text-right">Open tasks</TableHead>
                <TableHead className="text-right">Next meeting</TableHead>
                <TableHead className="text-right">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="max-w-72">
                    <Link href={`/accounts/${a.id}`} className="block truncate font-medium hover:underline">
                      {a.name}
                    </Link>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[a.industry, a.region].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Pill>{a.status}</Pill>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {a.aeId ? (
                      <Link href={`/account-executives/${a.aeId}`} className="hover:underline">
                        {a.aeName}
                      </Link>
                    ) : (
                      "Unassigned"
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="mr-1 tabular-nums">{a.opportunityCount}</span>
                      {a.salesMotions.map((m) => (
                        <Pill key={m} tone="brand">
                          {m}
                        </Pill>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{a.openActionItems || "—"}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    <LocalDateTime value={a.nextMeetingAt} pattern="MMM d · HH:mm" />
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    <LocalDateTime value={a.updatedAt} relative />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

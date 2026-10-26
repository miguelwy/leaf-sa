import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { getAccountExecutive } from "@/server/services/account-executives";
import { listAccounts } from "@/server/services/accounts";
import { listOpportunities } from "@/server/services/opportunities";
import { getEnumerations } from "@/server/services/settings";
import { NotFoundError } from "@/server/http/errors";
import { formatDateOnly } from "@/lib/format";
import { DefinitionList, EmptyState, PageHeader, Panel } from "@/components/common/layout-primitives";
import { ClassificationPills, Pill } from "@/components/common/badges";
import { Markdown } from "@/components/common/markdown";
import { AeFormDialog } from "@/components/account-executives/ae-form-dialog";
import { DeleteAeButton } from "@/components/account-executives/delete-ae-button";
import { SetBreadcrumbs } from "@/components/layout/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Params = Promise<{ aeId: string }>;

async function load(aeId: string) {
  try {
    return await getAccountExecutive(aeId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { aeId } = await params;
  const ae = await getAccountExecutive(aeId).catch(() => null);
  return { title: ae?.name ?? "Account Executive" };
}

export default async function AccountExecutivePage({ params }: { params: Params }) {
  const { aeId } = await params;
  const ae = await load(aeId);
  const [accounts, opportunities, enums] = await Promise.all([listAccounts({ aeId }), listOpportunities({ aeId }), getEnumerations()]);
  const active = opportunities.filter((o) => !o.stage || !enums.closedStages.includes(o.stage));

  return (
    <div className="space-y-5">
      <SetBreadcrumbs items={[{ label: "Account Executives", href: "/account-executives" }, { label: ae.name }]} />
      <PageHeader
        title={ae.name}
        description={[ae.territory, ae.region].filter(Boolean).join(" · ") || undefined}
        actions={
          <>
            <AeFormDialog
              ae={ae}
              trigger={
                <Button variant="outline" size="sm">
                  <Pencil className="size-3.5" /> Edit
                </Button>
              }
            />
            <DeleteAeButton id={ae.id} name={ae.name} accountCount={accounts.length} />
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Details" className="lg:col-span-1">
          <DefinitionList
            className="sm:grid-cols-1"
            items={[
              { label: "Email", value: ae.email ? <a className="hover:underline" href={`mailto:${ae.email}`}>{ae.email}</a> : null },
              { label: "Territory", value: ae.territory },
              { label: "Region", value: ae.region },
              { label: "Accounts", value: accounts.length },
              { label: "Active opportunities", value: active.length },
            ]}
          />
          {ae.notes && (
            <div className="mt-4 border-t pt-4">
              <Markdown>{ae.notes}</Markdown>
            </div>
          )}
        </Panel>

        <Panel title={`Accounts (${accounts.length})`} className="lg:col-span-2" bodyClassName="p-0">
          {accounts.length === 0 ? (
            <EmptyState compact className="m-4" title="No accounts assigned" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Account</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Opportunities</TableHead>
                  <TableHead className="pr-4 text-right">Open tasks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="pl-4">
                      <Link href={`/accounts/${a.id}`} className="font-medium hover:underline">
                        {a.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Pill>{a.status}</Pill>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{a.opportunityCount}</TableCell>
                    <TableCell className="pr-4 text-right tabular-nums">{a.openActionItems || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Panel>
      </div>

      <Panel title={`Opportunities (${opportunities.length})`} bodyClassName="p-0">
        {opportunities.length === 0 ? (
          <EmptyState compact className="m-4" title="No opportunities" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Opportunity</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Classification</TableHead>
                <TableHead className="pr-4 text-right">Next milestone</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {opportunities.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="pl-4 font-medium">
                    <Link href={`/accounts/${o.accountId}/opportunities#${o.id}`} className="hover:underline">
                      {o.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{o.accountName}</TableCell>
                  <TableCell>
                    <ClassificationPills salesMotion={o.salesMotion} tigerRoute={o.tigerRoute} stage={o.stage} />
                  </TableCell>
                  <TableCell className="pr-4 text-right text-xs text-muted-foreground">
                    {o.nextMilestone.title ?? "—"}
                    {o.nextMilestone.dueDate && ` · ${formatDateOnly(o.nextMilestone.dueDate)}`}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}

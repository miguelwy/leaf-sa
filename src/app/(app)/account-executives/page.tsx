import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, Plus } from "lucide-react";
import { listAccountExecutives } from "@/server/services/account-executives";
import { EmptyState, PageHeader } from "@/components/common/layout-primitives";
import { AeFormDialog } from "@/components/account-executives/ae-form-dialog";
import { SetBreadcrumbs } from "@/components/layout/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Account Executives" };

export default async function AccountExecutivesPage() {
  const aes = await listAccountExecutives();
  return (
    <div className="space-y-5">
      <SetBreadcrumbs items={[{ label: "Account Executives" }]} />
      <PageHeader
        title="Account Executives"
        description="The AEs you partner with, their territories and the accounts you cover together."
        actions={
          <AeFormDialog
            trigger={
              <Button size="sm">
                <Plus className="size-3.5" /> New AE
              </Button>
            }
          />
        }
      />
      {aes.length === 0 ? (
        <EmptyState icon={Briefcase} title="No account executives yet" description="Add the AEs you work with to assign accounts and filter by AE." />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Name</TableHead>
                <TableHead>Territory</TableHead>
                <TableHead>Region</TableHead>
                <TableHead className="text-right">Accounts</TableHead>
                <TableHead className="text-right">Active opportunities</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {aes.map((ae) => (
                <TableRow key={ae.id}>
                  <TableCell>
                    <Link href={`/account-executives/${ae.id}`} className="font-medium hover:underline">
                      {ae.name}
                    </Link>
                    {ae.email && <span className="block text-xs text-muted-foreground">{ae.email}</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{ae.territory ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{ae.region ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{ae.accountCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{ae.activeOpportunityCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

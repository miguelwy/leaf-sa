import { Plus } from "lucide-react";
import { actionItemFilterSchema } from "@/domain/entities";
import { listActionItems } from "@/server/services/action-items";
import { ActionItemFilters } from "@/components/action-items/action-item-filters";
import { ActionItemFormDialog } from "@/components/action-items/action-item-form-dialog";
import { ActionItemsTable } from "@/components/action-items/action-items-table";
import { SetBreadcrumbs } from "@/components/layout/breadcrumbs";
import { Button } from "@/components/ui/button";
import { loadAccount } from "../data";

export const metadata = { title: "Action Items" };

export default async function AccountActionsTab({
  params,
  searchParams,
}: {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<{ status?: string; due?: string }>;
}) {
  const { accountId } = await params;
  const sp = await searchParams;
  const parsed = actionItemFilterSchema.safeParse({ status: sp.status, due: sp.due });
  const filter = parsed.success ? parsed.data : actionItemFilterSchema.parse({});
  const account = await loadAccount(accountId);
  const items = await listActionItems({ ...filter, accountId });

  return (
    <div className="space-y-4">
      <SetBreadcrumbs items={[{ label: "Accounts", href: "/accounts" }, { label: account.name, href: `/accounts/${account.id}` }, { label: "Action Items" }]} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ActionItemFilters showAccountFilters={false} />
        <ActionItemFormDialog
          accountId={account.id}
          lockAccount
          trigger={
            <Button size="sm">
              <Plus className="size-3.5" /> New action item
            </Button>
          }
        />
      </div>
      <ActionItemsTable items={items} showAccount={false} emptyTitle="No action items for this account" />
    </div>
  );
}

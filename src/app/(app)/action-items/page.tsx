import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { actionItemFilterSchema } from "@/domain/entities";
import { listActionItems } from "@/server/services/action-items";
import { PageHeader } from "@/components/common/layout-primitives";
import { ActionItemFilters } from "@/components/action-items/action-item-filters";
import { ActionItemFormDialog } from "@/components/action-items/action-item-form-dialog";
import { ActionItemsTable } from "@/components/action-items/action-items-table";
import { SetBreadcrumbs } from "@/components/layout/breadcrumbs";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Action Items" };

type SearchParams = Promise<{ status?: string; due?: string; account?: string; ae?: string }>;

export default async function ActionItemsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const parsed = actionItemFilterSchema.safeParse({ status: sp.status, due: sp.due, accountId: sp.account, aeId: sp.ae });
  const filter = parsed.success ? parsed.data : actionItemFilterSchema.parse({});
  const items = await listActionItems(filter);

  return (
    <div className="space-y-5">
      <SetBreadcrumbs items={[{ label: "Action Items" }]} />
      <PageHeader
        title="Action Items"
        description="Commitments across all accounts. Click a status to change it, or tick to complete."
        actions={
          <ActionItemFormDialog
            trigger={
              <Button size="sm">
                <Plus className="size-3.5" /> New action item
              </Button>
            }
          />
        }
      />
      <ActionItemFilters />
      <ActionItemsTable items={items} emptyTitle="No action items match these filters" />
    </div>
  );
}

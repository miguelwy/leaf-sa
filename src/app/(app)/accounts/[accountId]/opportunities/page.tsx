import { Plus, Target } from "lucide-react";
import { EmptyState } from "@/components/common/layout-primitives";
import { OpportunityCard } from "@/components/opportunities/opportunity-card";
import { OpportunityFormDialog } from "@/components/opportunities/opportunity-form-dialog";
import { SetBreadcrumbs } from "@/components/layout/breadcrumbs";
import { Button } from "@/components/ui/button";
import { loadAccount, loadAccountOpportunities } from "../data";

export const metadata = { title: "Opportunities" };

export default async function OpportunitiesTab({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const [account, opportunities] = await Promise.all([loadAccount(accountId), loadAccountOpportunities(accountId)]);

  const addButton = (
    <OpportunityFormDialog
      accountId={account.id}
      accountAeId={account.aeId}
      trigger={
        <Button size="sm">
          <Plus className="size-3.5" /> New opportunity
        </Button>
      }
    />
  );

  return (
    <div className="space-y-4">
      <SetBreadcrumbs
        items={[{ label: "Accounts", href: "/accounts" }, { label: account.name, href: `/accounts/${account.id}` }, { label: "Opportunities" }]}
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Each opportunity tracks its own classification, discovery, workloads and architecture.
        </p>
        {addButton}
      </div>
      {opportunities.length === 0 ? (
        <EmptyState icon={Target} title="No opportunities yet" description="Create one for each initiative at this customer." />
      ) : (
        <div className="space-y-3">
          {opportunities.map((o) => (
            <OpportunityCard key={o.id} opportunity={o} aeName={o.aeName} />
          ))}
        </div>
      )}
    </div>
  );
}

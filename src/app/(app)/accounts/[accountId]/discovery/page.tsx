import { listWorkloads } from "@/server/services/workloads";
import { DiscoverySection } from "@/components/discovery/discovery-section";
import { NoOpportunityState } from "@/components/opportunities/no-opportunity-state";
import { OpportunityPicker } from "@/components/opportunities/opportunity-picker";
import { WorkloadsPanel } from "@/components/opportunities/workloads-panel";
import { SetBreadcrumbs } from "@/components/layout/breadcrumbs";
import { loadAccount, resolveSelectedOpportunity } from "../data";

export const metadata = { title: "Discovery" };

export default async function DiscoveryTab({
  params,
  searchParams,
}: {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<{ opp?: string }>;
}) {
  const { accountId } = await params;
  const { opp } = await searchParams;
  const [account, { opportunities, selected }] = await Promise.all([loadAccount(accountId), resolveSelectedOpportunity(accountId, opp)]);
  const crumbs = [{ label: "Accounts", href: "/accounts" }, { label: account.name, href: `/accounts/${account.id}` }, { label: "Discovery" }];

  if (!selected) {
    return (
      <>
        <SetBreadcrumbs items={crumbs} />
        <NoOpportunityState accountId={account.id} accountAeId={account.aeId} what="Discovery" />
      </>
    );
  }

  const workloads = await listWorkloads({ opportunityId: selected.id });
  const endpoint = `/api/opportunities/${selected.id}/discovery`;

  return (
    <div className="space-y-4">
      <SetBreadcrumbs items={crumbs} />
      <OpportunityPicker opportunities={opportunities} selectedId={selected.id} />
      <p className="text-xs text-muted-foreground">
        Empty fields are shown as <em>Unknown</em> on purpose: nothing is assumed. Mark uncertain information as tentative
        until the customer confirms it. Business value first, implementation details second.
      </p>
      <DiscoverySection key={`b-${selected.id}`} group="business" values={selected.discovery} endpointBase={endpoint} />
      <DiscoverySection key={`t-${selected.id}`} group="technical" values={selected.discovery} endpointBase={endpoint} />
      <WorkloadsPanel opportunityId={selected.id} workloads={workloads} />
      <DiscoverySection key={`c-${selected.id}`} group="competitive" values={selected.discovery} endpointBase={endpoint} defaultOpen={false} />
    </div>
  );
}

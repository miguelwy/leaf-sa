import { DiscoverySection } from "@/components/discovery/discovery-section";
import { NoOpportunityState } from "@/components/opportunities/no-opportunity-state";
import { OpportunityPicker } from "@/components/opportunities/opportunity-picker";
import { SetBreadcrumbs } from "@/components/layout/breadcrumbs";
import { loadAccount, resolveSelectedOpportunity } from "../data";

export const metadata = { title: "Architecture" };

export default async function ArchitectureTab({
  params,
  searchParams,
}: {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<{ opp?: string }>;
}) {
  const { accountId } = await params;
  const { opp } = await searchParams;
  const [account, { opportunities, selected }] = await Promise.all([loadAccount(accountId), resolveSelectedOpportunity(accountId, opp)]);
  const crumbs = [{ label: "Accounts", href: "/accounts" }, { label: account.name, href: `/accounts/${account.id}` }, { label: "Architecture" }];

  if (!selected) {
    return (
      <>
        <SetBreadcrumbs items={crumbs} />
        <NoOpportunityState accountId={account.id} accountAeId={account.aeId} what="Architecture" />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <SetBreadcrumbs items={crumbs} />
      <OpportunityPicker opportunities={opportunities} selectedId={selected.id} />
      <DiscoverySection
        key={selected.id}
        group="architecture"
        values={selected.discovery}
        endpointBase={`/api/opportunities/${selected.id}/discovery`}
        description="Current and target state, decisions, assumptions and tradeoffs. Diagrams use Mermaid syntax."
      />
    </div>
  );
}

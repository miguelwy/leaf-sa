import { NoOpportunityState } from "@/components/opportunities/no-opportunity-state";
import { OpportunityPicker } from "@/components/opportunities/opportunity-picker";
import { SolutionFitPanel } from "@/components/opportunities/solution-fit-panel";
import { SetBreadcrumbs } from "@/components/layout/breadcrumbs";
import { loadAccount, resolveSelectedOpportunity } from "../data";

export const metadata = { title: "Solution Fit" };

export default async function SolutionFitTab({
  params,
  searchParams,
}: {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<{ opp?: string }>;
}) {
  const { accountId } = await params;
  const { opp } = await searchParams;
  const [account, { opportunities, selected }] = await Promise.all([loadAccount(accountId), resolveSelectedOpportunity(accountId, opp)]);
  const crumbs = [{ label: "Accounts", href: "/accounts" }, { label: account.name, href: `/accounts/${account.id}` }, { label: "Solution Fit" }];

  return (
    <div className="space-y-4">
      <SetBreadcrumbs items={crumbs} />
      {selected ? (
        <>
          <OpportunityPicker opportunities={opportunities} selectedId={selected.id} />
          <SolutionFitPanel opportunityId={selected.id} entries={selected.solutionFit} />
        </>
      ) : (
        <NoOpportunityState accountId={account.id} accountAeId={account.aeId} what="Solution fit" />
      )}
    </div>
  );
}

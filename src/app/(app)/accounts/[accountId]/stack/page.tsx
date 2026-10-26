import { DiscoverySection } from "@/components/discovery/discovery-section";
import { SetBreadcrumbs } from "@/components/layout/breadcrumbs";
import { loadAccount } from "../data";

export const metadata = { title: "Technology Stack" };

export default async function StackTab({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const account = await loadAccount(accountId);
  return (
    <div className="space-y-4">
      <SetBreadcrumbs
        items={[{ label: "Accounts", href: "/accounts" }, { label: account.name, href: `/accounts/${account.id}` }, { label: "Technology Stack" }]}
      />
      <DiscoverySection
        group="stack"
        values={account.techStack}
        endpointBase={`/api/accounts/${account.id}/tech-stack`}
        description="The customer's technology landscape across the whole account. Opportunity-specific requirements live in Discovery."
      />
    </div>
  );
}

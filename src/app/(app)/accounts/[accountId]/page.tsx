import type { Metadata } from "next";
import { listActionItems } from "@/server/services/action-items";
import { listContacts } from "@/server/services/contacts";
import { listMeetings } from "@/server/services/meetings";
import { ActionItemsPanel } from "@/components/account/action-items-panel";
import { ChampionsPanel } from "@/components/account/champions-panel";
import { FeaturesPanel } from "@/components/account/features-panel";
import { KeyNotesPanel } from "@/components/account/key-notes-panel";
import { MeetingsPanel } from "@/components/account/meetings-panel";
import { OpportunitiesPanel } from "@/components/account/opportunities-panel";
import { Markdown } from "@/components/common/markdown";
import { SetBreadcrumbs } from "@/components/layout/breadcrumbs";
import { loadAccount, loadAccountOpportunities } from "./data";

type Params = Promise<{ accountId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { accountId } = await params;
  const account = await loadAccount(accountId);
  return { title: account.name };
}

export default async function AccountPage({ params }: { params: Params }) {
  const { accountId } = await params;
  // Resolve the account first so an unknown id renders not-found before other queries run.
  const account = await loadAccount(accountId);
  const [opportunities, contacts, tasks, meetings] = await Promise.all([
    loadAccountOpportunities(accountId),
    listContacts(accountId),
    listActionItems({ accountId, status: "open" }),
    listMeetings({ accountId, limit: 8 }),
  ]);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <SetBreadcrumbs items={[{ label: "Accounts", href: "/accounts" }, { label: account.name }]} />

      <div className="space-y-6">
        {account.description && (
          <div className="rounded-xl border bg-card px-5 py-4 shadow-xs">
            <Markdown>{account.description}</Markdown>
          </div>
        )}
        <ActionItemsPanel accountId={account.id} items={tasks} />
        <MeetingsPanel accountId={account.id} meetings={meetings} />
        <KeyNotesPanel accountId={account.id} notes={account.keyNotes} />
      </div>

      <div className="space-y-6">
        <ChampionsPanel accountId={account.id} contacts={contacts} />
        <FeaturesPanel accountId={account.id} features={account.features} />
        <OpportunitiesPanel accountId={account.id} accountAeId={account.aeId} opportunities={opportunities} />
      </div>
    </div>
  );
}

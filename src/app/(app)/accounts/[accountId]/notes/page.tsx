import { listAccountTags, listNotes } from "@/server/services/notes";
import { NotesWorkspace } from "@/components/notes/notes-workspace";
import { SetBreadcrumbs } from "@/components/layout/breadcrumbs";
import { loadAccount, loadAccountOpportunities } from "../data";

export const metadata = { title: "SA Notes" };

export default async function NotesTab({
  params,
  searchParams,
}: {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<{ q?: string; tag?: string }>;
}) {
  const { accountId } = await params;
  const { q, tag } = await searchParams;
  const account = await loadAccount(accountId);
  const [opportunities, notes, tags] = await Promise.all([
    loadAccountOpportunities(accountId),
    listNotes(accountId, { q, tag }),
    listAccountTags(accountId),
  ]);

  return (
    <>
      <SetBreadcrumbs items={[{ label: "Accounts", href: "/accounts" }, { label: account.name, href: `/accounts/${account.id}` }, { label: "SA Notes" }]} />
      <NotesWorkspace
        accountId={account.id}
        notes={notes}
        tags={tags}
        opportunities={opportunities.map((o) => ({ id: o.id, name: o.name }))}
      />
    </>
  );
}

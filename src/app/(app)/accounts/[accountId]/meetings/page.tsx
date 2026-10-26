import { Plus } from "lucide-react";
import { listMeetings } from "@/server/services/meetings";
import { MeetingsTable } from "@/components/meetings/meetings-table";
import { NewMeetingDialog } from "@/components/meetings/new-meeting-dialog";
import { SetBreadcrumbs } from "@/components/layout/breadcrumbs";
import { Button } from "@/components/ui/button";
import { loadAccount } from "../data";

export const metadata = { title: "Meetings" };

export default async function AccountMeetingsTab({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const account = await loadAccount(accountId);
  const meetings = await listMeetings({ accountId });

  const newButton = (
    <NewMeetingDialog
      accountId={account.id}
      trigger={
        <Button size="sm">
          <Plus className="size-3.5" /> New meeting
        </Button>
      }
    />
  );

  return (
    <div className="space-y-4">
      <SetBreadcrumbs items={[{ label: "Accounts", href: "/accounts" }, { label: account.name, href: `/accounts/${account.id}` }, { label: "Meetings" }]} />
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Meeting history for this account. Approved findings flow into Discovery with the meeting as their source.</p>
        {newButton}
      </div>
      <MeetingsTable meetings={meetings} showAccount={false} empty={newButton} />
    </div>
  );
}

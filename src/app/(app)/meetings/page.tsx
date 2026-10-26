import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { listMeetings } from "@/server/services/meetings";
import { PageHeader } from "@/components/common/layout-primitives";
import { MeetingsTable } from "@/components/meetings/meetings-table";
import { NewMeetingDialog } from "@/components/meetings/new-meeting-dialog";
import { SetBreadcrumbs } from "@/components/layout/breadcrumbs";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Meetings" };

export default async function MeetingsPage() {
  const meetings = await listMeetings({ limit: 200 });
  const newButton = (
    <NewMeetingDialog
      trigger={
        <Button size="sm">
          <Plus className="size-3.5" /> New meeting
        </Button>
      }
    />
  );
  return (
    <div className="space-y-5">
      <SetBreadcrumbs items={[{ label: "Meetings" }]} />
      <PageHeader
        title="Meetings"
        description="Customer meetings across all accounts. Upload a transcript, review the AI suggestions, approve what is right."
        actions={newButton}
      />
      <MeetingsTable meetings={meetings} />
    </div>
  );
}

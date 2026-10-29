import Link from "next/link";
import { CalendarClock, Plus } from "lucide-react";
import type { MeetingListItem } from "@/domain/meetings";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/common/badges";
import { EmptyState, Panel } from "@/components/common/layout-primitives";
import { LocalDateTime } from "@/components/common/local-time";
import { AnalysisStatusPill } from "@/components/meetings/meetings-table";
import { NewMeetingDialog } from "@/components/meetings/new-meeting-dialog";

export function MeetingsPanel({ accountId, meetings }: { accountId: string; meetings: MeetingListItem[] }) {
  return (
    <Panel
      title="Meetings"
      actions={
        <NewMeetingDialog
          accountId={accountId}
          trigger={
            <Button size="sm">
              <Plus className="size-4" /> New meeting
            </Button>
          }
        />
      }
    >
      {meetings.length === 0 ? (
        <EmptyState compact icon={CalendarClock} title="No meetings yet" description="Add a meeting with its transcript, then analyze it with Glean." />
      ) : (
        <ul className="divide-y rounded-lg border">
          {meetings.map((m) => (
            <li key={m.id}>
              <Link href={`/accounts/${accountId}/meetings/${m.id}`} className="flex items-center gap-3 px-3 py-3 hover:bg-muted/50">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{m.title}</p>
                  <p className="text-sm text-muted-foreground">
                    <LocalDateTime value={m.startsAt} pattern="EEE, MMM d · HH:mm" />
                    {m.type && ` · ${m.type}`}
                  </p>
                </div>
                {m.pendingSuggestions > 0 ? <Pill tone="warning">{m.pendingSuggestions} to review</Pill> : <AnalysisStatusPill status={m.analysisStatus} />}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

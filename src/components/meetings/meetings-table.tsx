import Link from "next/link";
import { CalendarClock, FileText } from "lucide-react";
import type { AnalysisStatus, MeetingListItem } from "@/domain/meetings";
import { Pill, type Tone } from "@/components/common/badges";
import { EmptyState } from "@/components/common/layout-primitives";
import { LocalDateTime } from "@/components/common/local-time";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const STATUS: Record<AnalysisStatus, { label: string; tone: Tone }> = {
  not_analyzed: { label: "Not analyzed", tone: "neutral" },
  analyzing: { label: "Analyzing…", tone: "info" },
  analyzed: { label: "Analyzed", tone: "success" },
  failed: { label: "Analysis failed", tone: "danger" },
};

export function AnalysisStatusPill({ status }: { status: AnalysisStatus }) {
  return <Pill tone={STATUS[status].tone}>{STATUS[status].label}</Pill>;
}

export function MeetingsTable({ meetings, showAccount = true, empty }: { meetings: MeetingListItem[]; showAccount?: boolean; empty?: React.ReactNode }) {
  if (meetings.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="No meetings yet"
        description="Add a meeting with its transcript to turn the conversation into reviewed account updates."
        action={empty}
      />
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead>Meeting</TableHead>
            {showAccount && <TableHead>Account</TableHead>}
            <TableHead>Type</TableHead>
            <TableHead>When</TableHead>
            <TableHead>Transcript</TableHead>
            <TableHead>Analysis</TableHead>
            <TableHead className="text-right">To review</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {meetings.map((m) => (
            <TableRow key={m.id}>
              <TableCell className="max-w-80">
                <Link href={`/accounts/${m.accountId}/meetings/${m.id}`} className="block truncate font-medium hover:underline">
                  {m.title}
                </Link>
                {m.opportunityName && <span className="block truncate text-xs text-muted-foreground">{m.opportunityName}</span>}
              </TableCell>
              {showAccount && (
                <TableCell className="max-w-48 truncate">
                  <Link href={`/accounts/${m.accountId}/meetings`} className="hover:underline">
                    {m.accountName}
                  </Link>
                </TableCell>
              )}
              <TableCell className="text-muted-foreground">{m.type ?? "—"}</TableCell>
              <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                <LocalDateTime value={m.startsAt} pattern="MMM d, yyyy · HH:mm" />
              </TableCell>
              <TableCell>
                {m.hasTranscript ? <FileText className="size-4 text-muted-foreground" aria-label="Has transcript" /> : <span className="text-muted-foreground">—</span>}
              </TableCell>
              <TableCell>
                <AnalysisStatusPill status={m.analysisStatus} />
              </TableCell>
              <TableCell className="text-right">
                {m.pendingSuggestions > 0 ? <Pill tone="warning">{m.pendingSuggestions} pending</Pill> : <span className="text-muted-foreground">—</span>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

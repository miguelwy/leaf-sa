"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ClipboardList, FileX, MoreHorizontal, Pencil, RefreshCw, Sparkles, Trash2, Upload, Users } from "lucide-react";
import { CHANGE_TYPE_LABELS, type Meeting, type MeetingAnalysis } from "@/domain/meetings";
import { api } from "@/lib/api";
import { useApiAction } from "@/hooks/use-api-action";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Pill } from "@/components/common/badges";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState, Panel, SectionLabel } from "@/components/common/layout-primitives";
import { LocalDateTime } from "@/components/common/local-time";
import { Markdown } from "@/components/common/markdown";
import { useReferenceData } from "@/components/common/reference-data";
import { AddTranscriptPanel } from "./add-transcript-panel";
import { ExternalAnalysisDialog } from "./external-analysis-dialog";
import { AnalysisPoller } from "./analysis-poller";
import { EditMeetingDialog } from "./edit-meeting-dialog";
import { AnalysisStatusPill } from "./meetings-table";
import { ReviewPanel } from "./review-panel";
import { TranscriptViewer, type Highlight } from "./transcript-viewer";

export interface JobInfo {
  provider: string;
  model: string;
  promptVersion: string;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number } | null;
  costUsd: number | null;
  durationMs: number | null;
}

function InsightList({ title, items }: { title: string; items: { text: string; kind?: string; confidence?: string }[] }) {
  if (!items.length) return null;
  return (
    <div className="space-y-1.5">
      <SectionLabel>{title}</SectionLabel>
      <ul className="space-y-1">
        {items.map((i, idx) => (
          <li key={idx} className="flex items-start gap-2 text-sm">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
            <span className="flex-1">{i.text}</span>
            {i.kind && i.kind !== "fact" && <Pill>{i.kind}</Pill>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MeetingWorkspace({
  meeting,
  analysis,
  job,
  opportunities,
}: {
  meeting: Meeting;
  analysis: MeetingAnalysis | null;
  job: JobInfo | null;
  opportunities: { id: string; name: string }[];
}) {
  const router = useRouter();
  const { ai } = useReferenceData();
  const { run, pending } = useApiAction();
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [replacingTranscript, setReplacingTranscript] = React.useState(false);

  const highlights: Highlight[] = React.useMemo(
    () =>
      (analysis?.suggestions ?? [])
        .filter((s) => s.evidence.start !== null && s.evidence.end !== null)
        .map((s) => ({
          id: s.id,
          start: s.evidence.start!,
          end: s.evidence.end!,
          tone: s.status === "approved" ? "approved" : s.status === "rejected" ? "rejected" : "pending",
        })),
    [analysis],
  );

  const select = (id: string) => {
    setActiveId(id);
    document.getElementById(`sg-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  const analyze = () => run(() => api("POST", `/api/meetings/${meeting.id}/analyze`), { success: "Analysis started" });
  const opportunityName = opportunities.find((o) => o.id === meeting.opportunityId)?.name;
  const output = analysis?.output;
  const canAnalyze = !!meeting.transcript && meeting.analysisStatus !== "analyzing";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">{meeting.title}</h2>
            <AnalysisStatusPill status={meeting.analysisStatus} />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <LocalDateTime value={meeting.startsAt} pattern="EEE, MMM d, yyyy · HH:mm" />
            {meeting.type && <span>{meeting.type}</span>}
            {opportunityName && (
              <Link href={`/accounts/${meeting.accountId}/discovery?opp=${meeting.opportunityId}`} className="hover:text-foreground hover:underline">
                {opportunityName}
              </Link>
            )}
            {meeting.participants.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <Users className="size-3.5" /> {meeting.participants.join(", ")}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {canAnalyze && (
            <ExternalAnalysisDialog
              meetingId={meeting.id}
              hasTranscript={!!meeting.transcript}
              trigger={
                <Button size="sm" variant={analysis || ai.ready ? "outline" : "default"}>
                  <ClipboardList className="size-3.5" /> {analysis ? "Re-import from Glean" : "Analyze with Glean"}
                </Button>
              }
            />
          )}
          {canAnalyze && ai.ready && (
            <Button size="sm" variant={analysis ? "outline" : "default"} disabled={pending} onClick={analyze}>
              {analysis ? <RefreshCw className="size-3.5" /> : <Sparkles className="size-3.5" />}
              {analysis ? "Re-analyze" : "Analyze with AI"}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="size-8" aria-label="Meeting actions">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditing(true)}>
                <Pencil className="size-4" /> Edit details
              </DropdownMenuItem>
              {meeting.transcript && (
                <DropdownMenuItem onSelect={() => setReplacingTranscript(true)} disabled={meeting.analysisStatus === "analyzing"}>
                  <Upload className="size-4" /> Replace transcript
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {meeting.transcript && (
                <ConfirmDialog
                  title="Delete the transcript?"
                  description="The raw transcript is permanently removed. The meeting, its analysis and the evidence quotes on approved facts are kept."
                  confirmLabel="Delete transcript"
                  onConfirm={() => run(() => api("DELETE", `/api/meetings/${meeting.id}/transcript`), { success: "Transcript deleted" })}
                  trigger={
                    <DropdownMenuItem variant="destructive" onSelect={(e) => e.preventDefault()}>
                      <FileX className="size-4" /> Delete transcript
                    </DropdownMenuItem>
                  }
                />
              )}
              <ConfirmDialog
                title="Delete this meeting?"
                description="The meeting, transcript and analysis are deleted. Facts you already approved stay on the account."
                confirmLabel="Delete meeting"
                onConfirm={async () => {
                  const ok = await run(() => api("DELETE", `/api/meetings/${meeting.id}`), { success: "Meeting deleted", refresh: false });
                  if (ok !== undefined) router.push(`/accounts/${meeting.accountId}/meetings`);
                }}
                trigger={
                  <DropdownMenuItem variant="destructive" onSelect={(e) => e.preventDefault()}>
                    <Trash2 className="size-4" /> Delete meeting
                  </DropdownMenuItem>
                }
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Status */}
      {meeting.analysisStatus === "analyzing" && <AnalysisPoller meetingId={meeting.id} />}
      {meeting.analysisStatus === "failed" && meeting.analysisError && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-danger-subtle px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 text-destructive" />
          <div className="flex-1">
            <p className="font-medium">The analysis failed</p>
            <p className="text-xs text-muted-foreground">{meeting.analysisError}</p>
          </div>
        </div>
      )}
      {!ai.ready && meeting.transcript && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm">
          <span className="text-muted-foreground">{ai.reason}</span>
          <Button asChild size="sm" variant="outline">
            <Link href="/settings#ai">Configure AI processing</Link>
          </Button>
        </div>
      )}

      {replacingTranscript || !meeting.transcript ? (
        <AddTranscriptPanel
          meetingId={meeting.id}
          replacing={!!meeting.transcript}
          onDone={meeting.transcript ? () => setReplacingTranscript(false) : undefined}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          {/* Left: transcript */}
          <section className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-xs lg:sticky lg:top-16 lg:h-[calc(100svh-5.5rem)]">
            <header className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
              <h3 className="text-sm font-semibold">Transcript</h3>
              <span className="text-[11px] text-muted-foreground">
                {meeting.transcript.fileName ?? meeting.transcript.format} · {meeting.transcript.charCount.toLocaleString()} chars ·{" "}
                {new Set(meeting.transcript.segments.map((s) => s.speaker).filter(Boolean)).size} speakers
              </span>
            </header>
            {highlights.length > 0 && (
              <p className="border-b bg-muted/30 px-4 py-1.5 text-[11px] text-muted-foreground">
                Highlighted passages support a suggestion. Click one to jump to it.
              </p>
            )}
            <TranscriptViewer raw={meeting.transcript.raw} highlights={highlights} activeId={activeId} onSelect={select} className="max-h-[70svh] flex-1 lg:max-h-none" />
          </section>

          {/* Right: analysis */}
          <div className="min-w-0 space-y-4">
            {!analysis ? (
              meeting.analysisStatus !== "analyzing" && (
                <EmptyState
                  icon={Sparkles}
                  title="Not analyzed yet"
                  description="Run the analysis to get a summary, insights and suggested account updates. Nothing changes until you approve."
                  action={
                    <div className="flex flex-wrap justify-center gap-2">
                      <ExternalAnalysisDialog
                        meetingId={meeting.id}
                        hasTranscript={!!meeting.transcript}
                        trigger={
                          <Button size="sm" variant={ai.ready ? "outline" : "default"}>
                            <ClipboardList className="size-3.5" /> Analyze with Glean
                          </Button>
                        }
                      />
                      {ai.ready && (
                        <Button size="sm" onClick={analyze} disabled={pending}>
                          <Sparkles className="size-3.5" /> Analyze with AI
                        </Button>
                      )}
                    </div>
                  }
                />
              )
            ) : (
              <>
                <Panel title="Summary">
                  <Markdown>{meeting.summary ?? output!.summary}</Markdown>
                  {output!.changesSinceLastMeeting.length > 0 && (
                    <div className="mt-4 space-y-2 border-t pt-3">
                      <SectionLabel>What changed since the last meeting</SectionLabel>
                      <ul className="space-y-1.5">
                        {output!.changesSinceLastMeeting.map((c, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <Pill tone={c.type === "contradiction" ? "danger" : c.type === "resolved_question" ? "success" : "info"}>
                              {CHANGE_TYPE_LABELS[c.type]}
                            </Pill>
                            <span>{c.text}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Panel>

                <Panel title="Suggested account updates" description="Review each change. Approved items are written with this meeting as their source.">
                  <ReviewPanel
                    analysisId={analysis.id}
                    suggestions={analysis.suggestions}
                    opportunities={opportunities}
                    activeId={activeId}
                    onSelect={select}
                  />
                </Panel>

                <Panel title="Meeting intelligence">
                  <div className="space-y-4">
                    <InsightList title="Business insights" items={output!.businessInsights} />
                    <InsightList title="Technical insights" items={output!.technicalInsights} />
                    <InsightList title="Decisions made" items={output!.decisions} />
                    <InsightList
                      title="Action items mentioned"
                      items={output!.actionItems.map((a) => ({
                        text: [a.title, a.owner && `— ${a.owner}`, a.dueDate && `(due ${a.dueDate})`].filter(Boolean).join(" "),
                      }))}
                    />
                    <InsightList title="Open questions" items={output!.openQuestions} />
                    <InsightList title="Still unknown" items={output!.missingInformation.map((text) => ({ text }))} />
                  </div>
                </Panel>

                <p className="text-[11px] text-muted-foreground">
                  {analysis.provider === "import" ? `Imported from ${analysis.model} ` : "Analyzed "}
                  <LocalDateTime value={analysis.createdAt} />
                  {analysis.provider !== "import" && ` · ${analysis.provider} · ${analysis.model}`} · {analysis.promptVersion}
                  {job?.usage && ` · ${(job.usage.inputTokens + job.usage.cacheReadTokens).toLocaleString()} in / ${job.usage.outputTokens.toLocaleString()} out tokens`}
                  {job?.costUsd !== null && job?.costUsd !== undefined && ` · ~$${job.costUsd.toFixed(3)}`}
                  {job?.durationMs && ` · ${Math.round(job.durationMs / 1000)}s`}
                </p>
              </>
            )}
          </div>
        </div>
      )}

      <EditMeetingDialog meeting={meeting} open={editing} onOpenChange={setEditing} />
    </div>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NotFoundError } from "@/server/http/errors";
import { getAnalysis, getLatestJob } from "@/server/services/meeting-analysis";
import { getMeeting } from "@/server/services/meetings";
import { MeetingWorkspace } from "@/components/meetings/meeting-workspace";
import { SetBreadcrumbs } from "@/components/layout/breadcrumbs";
import { loadAccount, loadAccountOpportunities } from "../../data";

type Params = Promise<{ accountId: string; meetingId: string }>;

async function loadMeeting(id: string, accountId: string) {
  try {
    const meeting = await getMeeting(id);
    if (meeting.accountId !== accountId) notFound();
    return meeting;
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { meetingId } = await params;
  const meeting = await getMeeting(meetingId).catch(() => null);
  return { title: meeting?.title ?? "Meeting" };
}

export default async function MeetingPage({ params }: { params: Params }) {
  const { accountId, meetingId } = await params;
  const account = await loadAccount(accountId);
  const [meeting, opportunities] = await Promise.all([loadMeeting(meetingId, accountId), loadAccountOpportunities(accountId)]);
  const [analysis, job] = await Promise.all([
    meeting.latestAnalysisId ? getAnalysis(meeting.latestAnalysisId) : Promise.resolve(null),
    getLatestJob(meeting.id),
  ]);

  return (
    <>
      <SetBreadcrumbs
        items={[
          { label: "Accounts", href: "/accounts" },
          { label: account.name, href: `/accounts/${account.id}` },
          { label: "Meetings", href: `/accounts/${account.id}/meetings` },
          { label: meeting.title },
        ]}
      />
      <MeetingWorkspace
        meeting={meeting}
        analysis={analysis}
        job={job && job.status === "succeeded" ? job : null}
        opportunities={opportunities.map((o) => ({ id: o.id, name: o.name }))}
      />
    </>
  );
}

import { route } from "@/server/http/handler";
import { getLatestJob } from "@/server/services/meeting-analysis";
import { getMeeting } from "@/server/services/meetings";

type Params = { id: string };

/** Lightweight polling endpoint used while an analysis runs. */
export const GET = route<Params>(async (_req, { params }) => {
  const meeting = await getMeeting(params.id);
  return {
    analysisStatus: meeting.analysisStatus,
    analysisError: meeting.analysisError,
    latestAnalysisId: meeting.latestAnalysisId,
    job: await getLatestJob(params.id),
  };
});

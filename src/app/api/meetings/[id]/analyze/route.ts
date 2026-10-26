import { after } from "next/server";
import { route } from "@/server/http/handler";
import { startMeetingAnalysis } from "@/server/services/meeting-analysis";

type Params = { id: string };

// The analysis runs after the response; allow the model call to finish.
export const maxDuration = 600;

export const POST = route<Params>(
  async (_req, { params, user }) => {
    const { jobId, run } = await startMeetingAnalysis(params.id, user);
    after(run);
    return { jobId, status: "analyzing" };
  },
  { status: 202 },
);

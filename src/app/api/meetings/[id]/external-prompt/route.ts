import { route } from "@/server/http/handler";
import { getExternalAnalysisPrompt } from "@/server/services/external-analysis";

type Params = { id: string };

/** Prompt to paste into an external assistant (e.g. Glean). `?transcript=0` leaves the transcript out. */
export const GET = route<Params>(async (req, { params }) =>
  getExternalAnalysisPrompt(params.id, req.nextUrl.searchParams.get("transcript") !== "0"),
);

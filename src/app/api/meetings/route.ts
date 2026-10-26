import { after } from "next/server";
import type { MeetingCreateInput } from "@/domain/meetings";
import { route } from "@/server/http/handler";
import { readMeetingRequest } from "@/server/http/transcript-upload";
import { startMeetingAnalysis } from "@/server/services/meeting-analysis";
import { createMeeting, listMeetings } from "@/server/services/meetings";

// Ingesting DOCX/PDF and queueing analysis can take a while.
export const maxDuration = 300;

export const GET = route(async (req) => listMeetings({ accountId: req.nextUrl.searchParams.get("accountId") }));

/** JSON or multipart (`data` JSON part + optional `file`). Pass `analyze: true` to queue AI analysis right away. */
export const POST = route(
  async (req, { user }) => {
    const { fields, transcript } = await readMeetingRequest(req);
    const meeting = await createMeeting(fields as MeetingCreateInput, transcript, user);
    let analysisQueued = false;
    let analysisError: string | null = null;
    if (fields.analyze === true && transcript) {
      try {
        const { run } = await startMeetingAnalysis(meeting.id, user);
        after(run);
        analysisQueued = true;
      } catch (error) {
        analysisError = error instanceof Error ? error.message : "Could not start the analysis";
      }
    }
    return { meeting: { ...meeting, transcript: null }, analysisQueued, analysisError };
  },
  { status: 201 },
);

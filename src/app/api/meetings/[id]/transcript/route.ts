import { ValidationError } from "@/server/http/errors";
import { route } from "@/server/http/handler";
import { readMeetingRequest } from "@/server/http/transcript-upload";
import { deleteTranscript, setTranscript } from "@/server/services/meetings";

type Params = { id: string };

export const maxDuration = 120;

/** Replace the transcript (JSON `transcriptText` or multipart `file`). */
export const PUT = route<Params>(async (req, { params, user }) => {
  const { transcript } = await readMeetingRequest(req);
  if (!transcript) throw new ValidationError("Provide transcript text or a file");
  const meeting = await setTranscript(params.id, transcript, user);
  return { ...meeting, transcript: null };
});

/** Retention control: delete the raw transcript, keep the meeting and its analysis. */
export const DELETE = route<Params>(async (_req, { params, user }) => {
  const meeting = await deleteTranscript(params.id, user);
  return { ...meeting, transcript: null };
});

import type { MeetingPatchInput } from "@/domain/meetings";
import { readJson, route } from "@/server/http/handler";
import { deleteMeeting, getMeeting, updateMeeting } from "@/server/services/meetings";

type Params = { id: string };

export const GET = route<Params>(async (_req, { params }) => getMeeting(params.id));

export const PATCH = route<Params>(async (req, { params, user }) => {
  const meeting = await updateMeeting(params.id, await readJson<MeetingPatchInput>(req), user);
  return { ...meeting, transcript: null };
});

export const DELETE = route<Params>(async (_req, { params, user }) => {
  await deleteMeeting(params.id, user);
  return { ok: true };
});

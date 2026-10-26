import type { NoteInput } from "@/domain/entities";
import { readJson, route } from "@/server/http/handler";
import { deleteNote, getNote, updateNote } from "@/server/services/notes";

type Params = { id: string };

export const GET = route<Params>(async (_req, { params }) => getNote(params.id));

export const PATCH = route<Params>(async (req, { params, user }) =>
  updateNote(params.id, await readJson<Partial<NoteInput>>(req), user),
);

export const DELETE = route<Params>(async (_req, { params, user }) => {
  await deleteNote(params.id, user);
  return { ok: true };
});

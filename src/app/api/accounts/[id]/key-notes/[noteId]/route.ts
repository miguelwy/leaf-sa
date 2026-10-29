import type { KeyNoteInput } from "@/domain/entities";
import { readJson, route } from "@/server/http/handler";
import { removeKeyNote, updateKeyNote } from "@/server/services/accounts";

type Params = { id: string; noteId: string };

export const PATCH = route<Params>(async (req, { params, user }) => updateKeyNote(params.id, params.noteId, await readJson<KeyNoteInput>(req), user));

export const DELETE = route<Params>(async (_req, { params, user }) => removeKeyNote(params.id, params.noteId, user));

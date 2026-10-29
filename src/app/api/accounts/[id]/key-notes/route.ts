import type { KeyNoteInput } from "@/domain/entities";
import { readJson, route } from "@/server/http/handler";
import { addKeyNote } from "@/server/services/accounts";

type Params = { id: string };

export const POST = route<Params>(async (req, { params, user }) => addKeyNote(params.id, await readJson<KeyNoteInput>(req), user), { status: 201 });

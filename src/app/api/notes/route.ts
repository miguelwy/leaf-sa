import type { NoteInput } from "@/domain/entities";
import { ValidationError } from "@/server/http/errors";
import { readJson, route } from "@/server/http/handler";
import { createNote, listNotes } from "@/server/services/notes";

export const GET = route(async (req) => {
  const sp = req.nextUrl.searchParams;
  const accountId = sp.get("accountId");
  if (!accountId) throw new ValidationError("accountId is required");
  return listNotes(accountId, { q: sp.get("q"), tag: sp.get("tag"), opportunityId: sp.get("opportunityId") });
});

export const POST = route(
  async (req, { user }) => createNote(await readJson<NoteInput & { accountId: string }>(req), user),
  { status: 201 },
);

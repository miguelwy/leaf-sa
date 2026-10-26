import { route } from "@/server/http/handler";
import { listNoteRevisions } from "@/server/services/notes";

type Params = { id: string };

export const GET = route<Params>(async (_req, { params }) => listNoteRevisions(params.id));

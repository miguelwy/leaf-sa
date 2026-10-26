import { route } from "@/server/http/handler";
import { listAccountHistory } from "@/server/services/history";

type Params = { id: string };

export const GET = route<Params>(async (req, { params }) => {
  const limit = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 50));
  return listAccountHistory(params.id, limit);
});

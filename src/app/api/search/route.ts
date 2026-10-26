import { route } from "@/server/http/handler";
import { search } from "@/server/services/search";

export const GET = route(async (req) => search(Object.fromEntries(req.nextUrl.searchParams.entries())));

import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";

/** Liveness/readiness probe for Docker. Does not expose any data. */
export async function GET() {
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503 });
  }
}

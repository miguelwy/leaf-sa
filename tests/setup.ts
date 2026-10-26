import { randomUUID } from "node:crypto";
import { afterAll, inject } from "vitest";

// Each test file gets its own database so files can run in parallel.
process.env.MONGODB_URI = inject("mongoUri");
process.env.MONGODB_DB = `sa_test_${randomUUID().slice(0, 8)}`;
process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-123";

afterAll(async () => {
  const { getDb, closeDb } = await import("@/server/db/client");
  const db = await getDb();
  await db.dropDatabase();
  await closeDb();
});

/**
 * Creates collections, $jsonSchema validators and indexes. Idempotent.
 * Usage: npm run db:setup
 */
import { closeDb, getDb } from "@/server/db/client";

async function main() {
  const db = await getDb(); // getDb() runs initDatabase() on first connection
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  console.log(`Database "${db.databaseName}" ready: ${collections.map((c) => c.name).sort().join(", ")}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());

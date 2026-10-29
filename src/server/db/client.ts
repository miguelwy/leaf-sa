import { MongoClient, type Db } from "mongodb";
import { env } from "@/server/env";
import { initDatabase } from "./init";
import { runDataMigrations } from "./migrations";

interface MongoState {
  client: MongoClient;
  ready: Promise<Db>;
}

// Cached on globalThis so dev hot-reloads and route handlers share one pool.
const globalForMongo = globalThis as unknown as { __saWorkspaceMongo?: MongoState };

export function getDb(): Promise<Db> {
  if (!globalForMongo.__saWorkspaceMongo) {
    const { MONGODB_URI, MONGODB_DB } = env();
    const client = new MongoClient(MONGODB_URI, { appName: "sa-workspace", maxPoolSize: 20 });
    const ready = client.connect().then(async (connected) => {
      const db = connected.db(MONGODB_DB);
      await initDatabase(db);
      await runDataMigrations(db);
      return db;
    });
    // Allow a retry on the next call if the first connection attempt fails.
    ready.catch(() => {
      globalForMongo.__saWorkspaceMongo = undefined;
      void client.close().catch(() => undefined);
    });
    globalForMongo.__saWorkspaceMongo = { client, ready };
  }
  return globalForMongo.__saWorkspaceMongo.ready;
}

export async function closeDb(): Promise<void> {
  const state = globalForMongo.__saWorkspaceMongo;
  globalForMongo.__saWorkspaceMongo = undefined;
  if (state) await state.client.close();
}

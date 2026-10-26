import { MongoMemoryServer } from "mongodb-memory-server";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    mongoUri: string;
  }
}

let server: MongoMemoryServer | undefined;

export async function setup(project: TestProject) {
  // Use an external MongoDB when provided (e.g. CI service container), otherwise in-memory.
  const external = process.env.TEST_MONGODB_URI;
  if (external) {
    project.provide("mongoUri", external);
    return;
  }
  server = await MongoMemoryServer.create();
  project.provide("mongoUri", server.getUri());
}

export async function teardown() {
  await server?.stop();
}

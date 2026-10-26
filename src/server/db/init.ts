import type { Db, Document, IndexDescription } from "mongodb";
import { COLLECTION_NAMES } from "./names";

const str = { bsonType: "string" };
const nullableStr = { bsonType: ["string", "null"] };
const nullableId = { bsonType: ["objectId", "null"] };
const nullableDate = { bsonType: ["date", "null"] };
const date = { bsonType: "date" };
const objectId = { bsonType: "objectId" };

const sourceSchema = {
  bsonType: "object",
  required: ["kind"],
  properties: { kind: { enum: ["manual", "meeting"] } },
};

/**
 * $jsonSchema validators are a safety net behind Zod (validationLevel "moderate"
 * so legacy documents can still be updated). They check structure and types of
 * the fields that other code relies on, not every business rule.
 */
const VALIDATORS: Record<string, Document> = {
  [COLLECTION_NAMES.users]: {
    bsonType: "object",
    required: ["email", "name", "passwordHash", "role", "createdAt"],
    properties: {
      email: str,
      name: str,
      passwordHash: str,
      role: { enum: ["owner", "member"] },
      createdAt: date,
    },
  },
  [COLLECTION_NAMES.accountExecutives]: {
    bsonType: "object",
    required: ["name", "createdAt", "updatedAt"],
    properties: { name: str, email: nullableStr, territory: nullableStr, region: nullableStr, createdAt: date, updatedAt: date },
  },
  [COLLECTION_NAMES.accounts]: {
    bsonType: "object",
    required: ["name", "nameLower", "status", "techStack", "createdAt", "updatedAt"],
    properties: {
      name: str,
      nameLower: str,
      status: str,
      aeId: nullableId,
      website: nullableStr,
      lastInteractionAt: nullableDate,
      nextMeetingAt: nullableDate,
      techStack: { bsonType: "object" },
      createdAt: date,
      updatedAt: date,
    },
  },
  [COLLECTION_NAMES.contacts]: {
    bsonType: "object",
    required: ["accountId", "name", "isPrimary", "createdAt"],
    properties: { accountId: objectId, name: str, email: nullableStr, isPrimary: { bsonType: "bool" }, createdAt: date },
  },
  [COLLECTION_NAMES.opportunities]: {
    bsonType: "object",
    required: ["accountId", "name", "discovery", "solutionFit", "createdAt", "updatedAt"],
    properties: {
      accountId: objectId,
      aeId: nullableId,
      name: str,
      salesMotion: nullableStr,
      tigerRoute: nullableStr,
      stage: nullableStr,
      discovery: { bsonType: "object" },
      solutionFit: { bsonType: "array", maxItems: 50 },
      createdAt: date,
      updatedAt: date,
    },
  },
  [COLLECTION_NAMES.workloads]: {
    bsonType: "object",
    required: ["accountId", "opportunityId", "name", "createdAt"],
    properties: { accountId: objectId, opportunityId: objectId, name: str, createdAt: date },
  },
  [COLLECTION_NAMES.notes]: {
    bsonType: "object",
    required: ["accountId", "title", "body", "tags", "pinned", "revision", "createdAt", "updatedAt"],
    properties: {
      accountId: objectId,
      opportunityId: nullableId,
      meetingId: nullableId,
      title: str,
      body: str,
      tags: { bsonType: "array", maxItems: 20, items: str },
      pinned: { bsonType: "bool" },
      revision: { bsonType: "int" },
      createdAt: date,
      updatedAt: date,
    },
  },
  [COLLECTION_NAMES.noteRevisions]: {
    bsonType: "object",
    required: ["noteId", "accountId", "revision", "title", "body", "editedAt"],
    properties: { noteId: objectId, accountId: objectId, revision: { bsonType: "int" }, editedAt: date },
  },
  [COLLECTION_NAMES.actionItems]: {
    bsonType: "object",
    required: ["title", "status", "source", "createdAt", "updatedAt"],
    properties: {
      title: str,
      status: { enum: ["todo", "in_progress", "blocked", "done"] },
      accountId: nullableId,
      opportunityId: nullableId,
      dueDate: nullableDate,
      completedAt: nullableDate,
      source: sourceSchema,
      createdAt: date,
      updatedAt: date,
    },
  },
  [COLLECTION_NAMES.meetings]: {
    bsonType: "object",
    required: ["accountId", "title", "startsAt", "participants", "analysisStatus", "createdAt", "updatedAt"],
    properties: {
      accountId: objectId,
      opportunityId: nullableId,
      title: str,
      startsAt: date,
      participants: { bsonType: "array", maxItems: 50 },
      transcript: {
        bsonType: ["object", "null"],
        required: ["raw", "format", "charCount"],
        properties: { raw: str, format: { enum: ["paste", "txt", "md", "docx", "pdf"] } },
      },
      analysisStatus: { enum: ["not_analyzed", "analyzing", "analyzed", "failed"] },
      latestAnalysisId: nullableId,
      createdAt: date,
      updatedAt: date,
    },
  },
  [COLLECTION_NAMES.meetingAnalyses]: {
    bsonType: "object",
    required: ["meetingId", "accountId", "jobId", "provider", "model", "promptVersion", "output", "suggestions", "createdAt"],
    properties: {
      meetingId: objectId,
      accountId: objectId,
      jobId: objectId,
      provider: { enum: ["anthropic", "openai", "import"] },
      suggestions: { bsonType: "array" },
      createdAt: date,
    },
  },
  [COLLECTION_NAMES.aiJobs]: {
    bsonType: "object",
    required: ["kind", "status", "attempts", "provider", "model", "createdAt"],
    properties: {
      kind: { enum: ["meeting_analysis"] },
      status: { enum: ["queued", "running", "succeeded", "failed"] },
      attempts: { bsonType: "int" },
      createdAt: date,
    },
  },
  [COLLECTION_NAMES.history]: {
    bsonType: "object",
    required: ["accountId", "entityType", "entityId", "action", "changes", "actor", "at"],
    properties: {
      accountId: objectId,
      entityId: objectId,
      action: { enum: ["create", "update", "delete"] },
      changes: { bsonType: "array" },
      at: date,
    },
  },
};

const TEXT_WEIGHTS = { weights: { name: 10, title: 10, tags: 5 } };

const INDEXES: Record<string, IndexDescription[]> = {
  [COLLECTION_NAMES.users]: [{ key: { email: 1 }, name: "email_unique", unique: true }],
  [COLLECTION_NAMES.accountExecutives]: [
    { key: { email: 1 }, name: "email_unique", unique: true, partialFilterExpression: { email: { $type: "string" } } },
    { key: { name: 1 }, name: "name" },
    { key: { name: "text", territory: "text", region: "text", notes: "text" }, name: "text_search", ...TEXT_WEIGHTS },
  ],
  [COLLECTION_NAMES.accounts]: [
    { key: { nameLower: 1 }, name: "name_unique", unique: true },
    { key: { aeId: 1, updatedAt: -1 }, name: "ae_updated" },
    { key: { status: 1 }, name: "status" },
    { key: { updatedAt: -1 }, name: "updated" },
    { key: { nextMeetingAt: 1 }, name: "next_meeting" },
    {
      key: { name: "text", industry: "text", description: "text", internalNotes: "text", region: "text" },
      name: "text_search",
      ...TEXT_WEIGHTS,
    },
  ],
  [COLLECTION_NAMES.contacts]: [
    { key: { accountId: 1, isPrimary: -1, name: 1 }, name: "account_primary" },
    { key: { name: "text", title: "text", email: "text" }, name: "text_search", ...TEXT_WEIGHTS },
  ],
  [COLLECTION_NAMES.opportunities]: [
    { key: { accountId: 1, updatedAt: -1 }, name: "account_updated" },
    { key: { aeId: 1 }, name: "ae" },
    { key: { salesMotion: 1 }, name: "sales_motion" },
    { key: { "nextMilestone.dueDate": 1 }, name: "next_milestone" },
    { key: { name: "text", description: "text", expectedWorkload: "text" }, name: "text_search", ...TEXT_WEIGHTS },
  ],
  [COLLECTION_NAMES.workloads]: [{ key: { opportunityId: 1, name: 1 }, name: "opportunity" }, { key: { accountId: 1 }, name: "account" }],
  [COLLECTION_NAMES.notes]: [
    { key: { accountId: 1, pinned: -1, updatedAt: -1 }, name: "account_pinned_updated" },
    { key: { tags: 1 }, name: "tags" },
    { key: { opportunityId: 1 }, name: "opportunity", sparse: true },
    { key: { title: "text", body: "text", tags: "text" }, name: "text_search", ...TEXT_WEIGHTS },
  ],
  [COLLECTION_NAMES.noteRevisions]: [{ key: { noteId: 1, revision: -1 }, name: "note_revision_unique", unique: true }],
  [COLLECTION_NAMES.actionItems]: [
    { key: { status: 1, dueDate: 1 }, name: "status_due" },
    { key: { accountId: 1, status: 1, dueDate: 1 }, name: "account_status_due" },
    { key: { opportunityId: 1 }, name: "opportunity", sparse: true },
    { key: { title: "text", description: "text", owner: "text" }, name: "text_search", ...TEXT_WEIGHTS },
  ],
  [COLLECTION_NAMES.meetings]: [
    { key: { accountId: 1, startsAt: -1 }, name: "account_starts" },
    { key: { startsAt: -1 }, name: "starts" },
    { key: { opportunityId: 1 }, name: "opportunity", sparse: true },
    { key: { title: "text", summary: "text", "transcript.raw": "text" }, name: "text_search", weights: { title: 10, summary: 5, "transcript.raw": 1 } },
  ],
  [COLLECTION_NAMES.meetingAnalyses]: [
    { key: { meetingId: 1, createdAt: -1 }, name: "meeting_created" },
    { key: { accountId: 1, createdAt: -1 }, name: "account_created" },
  ],
  [COLLECTION_NAMES.aiJobs]: [
    { key: { status: 1, createdAt: -1 }, name: "status_created" },
    { key: { meetingId: 1, createdAt: -1 }, name: "meeting_created" },
  ],
  [COLLECTION_NAMES.history]: [
    { key: { accountId: 1, at: -1 }, name: "account_at" },
    { key: { entityId: 1, at: -1 }, name: "entity_at" },
  ],
};

/** Idempotent: safe to run on every boot and from `npm run db:setup`. */
export async function initDatabase(db: Db): Promise<void> {
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));

  for (const name of Object.values(COLLECTION_NAMES)) {
    const validator = VALIDATORS[name];
    if (!existing.has(name)) {
      await db.createCollection(name, validator ? { validator: { $jsonSchema: validator }, validationLevel: "moderate" } : {});
    } else if (validator) {
      await db.command({ collMod: name, validator: { $jsonSchema: validator }, validationLevel: "moderate" });
    }
    const indexes = INDEXES[name];
    if (indexes?.length) await db.collection(name).createIndexes(indexes);
  }
}

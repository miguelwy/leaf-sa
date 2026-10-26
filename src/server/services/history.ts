import "server-only";
import { ObjectId } from "mongodb";
import type { SessionUser } from "@/domain/auth";
import type { ChangeHistoryEntry, FieldChange, HistoryEntityType } from "@/domain/entities";
import { collections } from "@/server/db/collections";
import { toObjectId } from "@/server/db/ids";

/** Normalises values so equal dates/ids/arrays compare equal and serialise cleanly. */
export function normalizeValue(value: unknown): unknown {
  if (value === undefined || value === null || value === "") return null;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof ObjectId) return value.toHexString();
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, normalizeValue(v)]));
  }
  return value;
}

/** Field-level diff over the given keys. Only keys present in `after` are compared. */
export function diffObjects(
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
  fields: readonly string[],
): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const field of fields) {
    if (!(field in after)) continue;
    const from = normalizeValue(before?.[field]);
    const to = normalizeValue(after[field]);
    if (JSON.stringify(from) !== JSON.stringify(to)) changes.push({ field, from, to });
  }
  return changes;
}

/** Lets callers mark changes that came from an approved AI suggestion. */
export interface AuditOptions {
  actorKind?: "user" | "ai-approved";
}

export interface RecordChangeInput {
  accountId: ObjectId;
  entityType: HistoryEntityType;
  entityId: ObjectId;
  entityLabel: string;
  action: "create" | "update" | "delete";
  changes: FieldChange[];
  actor: SessionUser | null;
  actorKind?: "user" | "ai-approved";
}

export async function recordChange(input: RecordChangeInput): Promise<void> {
  if (input.action === "update" && input.changes.length === 0) return;
  const { history } = await collections();
  await history.insertOne({
    _id: new ObjectId(),
    accountId: input.accountId,
    entityType: input.entityType,
    entityId: input.entityId,
    entityLabel: input.entityLabel,
    action: input.action,
    changes: input.changes,
    actor: {
      kind: input.actorKind ?? "user",
      userId: input.actor ? toObjectId(input.actor.id, "User") : null,
      name: input.actor?.name ?? null,
    },
    at: new Date(),
  });
}

export async function listAccountHistory(accountId: string, limit = 50): Promise<ChangeHistoryEntry[]> {
  const { history } = await collections();
  const docs = await history
    .find({ accountId: toObjectId(accountId, "Account") })
    .sort({ at: -1 })
    .limit(limit)
    .toArray();
  return docs.map((d) => ({
    id: d._id.toHexString(),
    accountId: d.accountId.toHexString(),
    entityType: d.entityType,
    entityId: d.entityId.toHexString(),
    entityLabel: d.entityLabel,
    action: d.action,
    changes: d.changes,
    actor: { kind: d.actor.kind, userId: d.actor.userId?.toHexString() ?? null, name: d.actor.name },
    at: d.at,
  }));
}

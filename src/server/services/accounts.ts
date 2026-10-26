import "server-only";
import { ObjectId, type Filter } from "mongodb";
import type { SessionUser } from "@/domain/auth";
import { getFieldDef, type DiscoveryItemInput } from "@/domain/discovery";
import {
  accountInputSchema,
  accountPatchSchema,
  type Account,
  type AccountInput,
  type AccountListItem,
} from "@/domain/entities";
import { collections } from "@/server/db/collections";
import { idString, toObjectId, toObjectIdOrNull } from "@/server/db/ids";
import type { AccountDoc } from "@/server/db/types";
import { ConflictError, NotFoundError, ValidationError } from "@/server/http/errors";
import { mapDiscoveryValues, mergeDiscoveryItems, summarizeItems } from "./discovery";
import { diffObjects, recordChange } from "./history";
import { assertEnumValue, getEnumerations } from "./settings";

const AUDITED_FIELDS = [
  "name",
  "industry",
  "website",
  "region",
  "aeId",
  "status",
  "description",
  "internalNotes",
  "lastInteractionAt",
  "nextMeetingAt",
] as const;

export function mapAccount(doc: AccountDoc): Account {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    industry: doc.industry,
    website: doc.website,
    region: doc.region,
    aeId: idString(doc.aeId),
    status: doc.status,
    description: doc.description,
    internalNotes: doc.internalNotes,
    lastInteractionAt: doc.lastInteractionAt,
    nextMeetingAt: doc.nextMeetingAt,
    techStack: mapDiscoveryValues(doc.techStack),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function assertAeExists(aeId: ObjectId | null) {
  if (!aeId) return;
  const { accountExecutives } = await collections();
  if (!(await accountExecutives.countDocuments({ _id: aeId }, { limit: 1 }))) {
    throw new ValidationError("Validation failed", { formErrors: [], fieldErrors: { aeId: ["Account executive not found"] } });
  }
}

function duplicateNameGuard(error: unknown): never {
  if ((error as { code?: number }).code === 11000) throw new ConflictError("An account with this name already exists");
  throw error;
}

export interface AccountListFilter {
  aeId?: string | null;
  status?: string | null;
  salesMotion?: string | null;
  q?: string | null;
}

export async function listAccounts(filter: AccountListFilter = {}): Promise<AccountListItem[]> {
  const { accounts } = await collections();
  const match: Filter<AccountDoc> = {};
  if (filter.aeId) match.aeId = toObjectId(filter.aeId, "Account executive");
  if (filter.status) match.status = filter.status;
  if (filter.q) match.nameLower = { $regex: escapeRegex(filter.q.toLowerCase()) };

  const docs = await accounts
    .aggregate<AccountDoc & { aeName: string | null; salesMotions: (string | null)[]; opportunityCount: number; openActionItems: number }>([
      { $match: match },
      { $sort: { nameLower: 1 } },
      { $lookup: { from: "account_executives", localField: "aeId", foreignField: "_id", pipeline: [{ $project: { name: 1 } }], as: "ae" } },
      {
        $lookup: {
          from: "opportunities",
          localField: "_id",
          foreignField: "accountId",
          pipeline: [{ $project: { salesMotion: 1 } }],
          as: "opps",
        },
      },
      {
        $lookup: {
          from: "action_items",
          localField: "_id",
          foreignField: "accountId",
          pipeline: [{ $match: { status: { $ne: "done" } } }, { $count: "n" }],
          as: "openTasks",
        },
      },
      {
        $addFields: {
          aeName: { $ifNull: [{ $first: "$ae.name" }, null] },
          salesMotions: { $setUnion: ["$opps.salesMotion", []] },
          opportunityCount: { $size: "$opps" },
          openActionItems: { $ifNull: [{ $first: "$openTasks.n" }, 0] },
        },
      },
      { $project: { ae: 0, opps: 0, openTasks: 0 } },
    ])
    .toArray();

  return docs
    .map((d) => ({
      ...mapAccount(d),
      aeName: d.aeName,
      opportunityCount: d.opportunityCount,
      salesMotions: d.salesMotions.filter((m): m is string => !!m),
      openActionItems: d.openActionItems,
    }))
    .filter((a) => !filter.salesMotion || a.salesMotions.includes(filter.salesMotion));
}

export async function getAccount(id: string): Promise<Account> {
  const { accounts } = await collections();
  const doc = await accounts.findOne({ _id: toObjectId(id, "Account") });
  if (!doc) throw new NotFoundError("Account");
  return mapAccount(doc);
}

export async function listAccountOptions(): Promise<{ id: string; name: string }[]> {
  const { accounts } = await collections();
  const docs = await accounts.find({}, { projection: { name: 1 } }).sort({ nameLower: 1 }).toArray();
  return docs.map((d) => ({ id: d._id.toHexString(), name: d.name }));
}

export async function createAccount(raw: AccountInput, actor: SessionUser): Promise<Account> {
  const input = accountInputSchema.parse(raw);
  const enums = await getEnumerations();
  assertEnumValue(enums, "accountStatuses", "status", input.status);
  const aeId = toObjectIdOrNull(input.aeId, "Account executive");
  await assertAeExists(aeId);

  const now = new Date();
  const doc: AccountDoc = {
    _id: new ObjectId(),
    ...input,
    nameLower: input.name.toLowerCase(),
    aeId,
    techStack: {},
    createdAt: now,
    updatedAt: now,
  };
  const { accounts } = await collections();
  await accounts.insertOne(doc).catch(duplicateNameGuard);
  await recordChange({
    accountId: doc._id,
    entityType: "account",
    entityId: doc._id,
    entityLabel: doc.name,
    action: "create",
    changes: diffObjects(null, doc as unknown as Record<string, unknown>, AUDITED_FIELDS),
    actor,
  });
  return mapAccount(doc);
}

export async function updateAccount(id: string, raw: Partial<AccountInput>, actor: SessionUser): Promise<Account> {
  const input = accountPatchSchema.parse(raw);
  const _id = toObjectId(id, "Account");
  const { accounts } = await collections();
  const before = await accounts.findOne({ _id });
  if (!before) throw new NotFoundError("Account");

  const enums = await getEnumerations();
  if (input.status !== undefined) assertEnumValue(enums, "accountStatuses", "status", input.status, before.status);

  const { aeId: rawAeId, ...rest } = input;
  const set: Partial<AccountDoc> = { ...rest, updatedAt: new Date() };
  if (input.name !== undefined) set.nameLower = input.name.toLowerCase();
  if (rawAeId !== undefined) {
    set.aeId = toObjectIdOrNull(rawAeId, "Account executive");
    await assertAeExists(set.aeId);
  }

  const after = await accounts.findOneAndUpdate({ _id }, { $set: set }, { returnDocument: "after" }).catch(duplicateNameGuard);
  if (!after) throw new NotFoundError("Account");
  await recordChange({
    accountId: _id,
    entityType: "account",
    entityId: _id,
    entityLabel: after.name,
    action: "update",
    changes: diffObjects(before as unknown as Record<string, unknown>, set as Record<string, unknown>, AUDITED_FIELDS),
    actor,
  });
  return mapAccount(after);
}

export async function updateTechStackField(
  accountId: string,
  fieldKey: string,
  items: DiscoveryItemInput[],
  actor: SessionUser,
): Promise<Account> {
  const def = getFieldDef(fieldKey, "account");
  if (!def) throw new NotFoundError("Field");
  const _id = toObjectId(accountId, "Account");
  const { accounts } = await collections();
  const before = await accounts.findOne({ _id });
  if (!before) throw new NotFoundError("Account");

  const merged = mergeDiscoveryItems(def, before.techStack?.[fieldKey], items);
  const after = await accounts.findOneAndUpdate(
    { _id },
    { $set: { [`techStack.${fieldKey}`]: merged, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!after) throw new NotFoundError("Account");
  await recordChange({
    accountId: _id,
    entityType: "account",
    entityId: _id,
    entityLabel: after.name,
    action: "update",
    changes: diffObjects(
      { [`techStack.${fieldKey}`]: summarizeItems(before.techStack?.[fieldKey]) },
      { [`techStack.${fieldKey}`]: summarizeItems(merged) },
      [`techStack.${fieldKey}`],
    ),
    actor,
  });
  return mapAccount(after);
}

/**
 * Permanently deletes an account and every record that belongs to it, including
 * its change history (supports customer data deletion requests).
 */
export async function deleteAccount(id: string): Promise<void> {
  const _id = toObjectId(id, "Account");
  const c = await collections();
  const res = await c.accounts.deleteOne({ _id });
  if (res.deletedCount === 0) throw new NotFoundError("Account");
  await Promise.all([
    c.contacts.deleteMany({ accountId: _id }),
    c.opportunities.deleteMany({ accountId: _id }),
    c.workloads.deleteMany({ accountId: _id }),
    c.notes.deleteMany({ accountId: _id }),
    c.noteRevisions.deleteMany({ accountId: _id }),
    c.actionItems.deleteMany({ accountId: _id }),
    c.history.deleteMany({ accountId: _id }),
    c.meetings.deleteMany({ accountId: _id }),
    c.meetingAnalyses.deleteMany({ accountId: _id }),
    c.aiJobs.deleteMany({ accountId: _id }),
  ]);
}

/** Bumps the account's updatedAt so "recently updated" reflects child changes. */
export async function touchAccount(accountId: ObjectId): Promise<void> {
  const { accounts } = await collections();
  await accounts.updateOne({ _id: accountId }, { $set: { updatedAt: new Date() } });
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

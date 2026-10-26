import "server-only";
import { ObjectId, type Filter } from "mongodb";
import type { SessionUser } from "@/domain/auth";
import {
  actionItemInputSchema,
  actionItemPatchSchema,
  type ActionItem,
  type ActionItemFilter,
  type ActionItemInput,
  type ActionItemListItem,
} from "@/domain/entities";
import { collections } from "@/server/db/collections";
import { idString, toObjectId, toObjectIdOrNull } from "@/server/db/ids";
import type { ActionItemDoc } from "@/server/db/types";
import { NotFoundError, ValidationError } from "@/server/http/errors";
import { diffObjects, recordChange, type AuditOptions } from "./history";
import { assertEnumValue, getEnumerations } from "./settings";

const AUDITED_FIELDS = ["title", "description", "opportunityId", "owner", "dueDate", "priority", "status"] as const;

export function mapActionItem(doc: ActionItemDoc): ActionItem {
  return {
    id: doc._id.toHexString(),
    title: doc.title,
    description: doc.description,
    accountId: idString(doc.accountId),
    opportunityId: idString(doc.opportunityId),
    meetingId: idString(doc.meetingId),
    owner: doc.owner,
    dueDate: doc.dueDate,
    priority: doc.priority,
    status: doc.status,
    source:
      doc.source.kind === "meeting"
        ? { kind: "meeting", meetingId: doc.source.meetingId.toHexString(), excerpt: doc.source.excerpt ?? null }
        : { kind: "manual" },
    completedAt: doc.completedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/** Resolves and validates the account/opportunity link. An opportunity implies its account. */
async function resolveLinks(accountIdRaw: string | null | undefined, opportunityIdRaw: string | null | undefined) {
  const { accounts, opportunities } = await collections();
  let accountId = toObjectIdOrNull(accountIdRaw, "Account");
  const opportunityId = toObjectIdOrNull(opportunityIdRaw, "Opportunity");
  if (opportunityId) {
    const opp = await opportunities.findOne({ _id: opportunityId }, { projection: { accountId: 1 } });
    if (!opp) throw new ValidationError("Validation failed", { formErrors: [], fieldErrors: { opportunityId: ["Opportunity not found"] } });
    if (accountId && !opp.accountId.equals(accountId)) {
      throw new ValidationError("Validation failed", {
        formErrors: [],
        fieldErrors: { opportunityId: ["Opportunity does not belong to the selected account"] },
      });
    }
    accountId = opp.accountId;
  }
  if (accountId && !(await accounts.countDocuments({ _id: accountId }, { limit: 1 }))) {
    throw new ValidationError("Validation failed", { formErrors: [], fieldErrors: { accountId: ["Account not found"] } });
  }
  return { accountId, opportunityId };
}

export function startOfTodayUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function listActionItems(filter: Partial<ActionItemFilter> = {}): Promise<ActionItemListItem[]> {
  const { actionItems, accounts } = await collections();
  const match: Filter<ActionItemDoc> = {};
  const status = filter.status ?? "open";
  if (status === "open") match.status = { $ne: "done" };
  else if (status !== "all") match.status = status;

  if (filter.accountId) {
    match.accountId = toObjectId(filter.accountId, "Account");
  } else if (filter.aeId) {
    const ids = await accounts.distinct("_id", { aeId: toObjectId(filter.aeId, "Account executive") });
    match.accountId = { $in: ids };
  }

  const today = startOfTodayUtc();
  if (filter.due === "overdue") match.dueDate = { $lt: today };
  if (filter.due === "week") match.dueDate = { $gte: today, $lt: new Date(today.getTime() + 7 * 86400000) };

  const docs = await actionItems
    .aggregate<ActionItemDoc & { accountName: string | null; opportunityName: string | null }>([
      { $match: match },
      // Items with a due date first (soonest first), undated last, then newest.
      { $addFields: { _undated: { $cond: [{ $eq: [{ $ifNull: ["$dueDate", null] }, null] }, 1, 0] } } },
      { $sort: { _undated: 1, dueDate: 1, createdAt: -1 } },
      { $limit: 1000 },
      { $lookup: { from: "accounts", localField: "accountId", foreignField: "_id", pipeline: [{ $project: { name: 1 } }], as: "acc" } },
      { $lookup: { from: "opportunities", localField: "opportunityId", foreignField: "_id", pipeline: [{ $project: { name: 1 } }], as: "opp" } },
      {
        $addFields: {
          accountName: { $ifNull: [{ $first: "$acc.name" }, null] },
          opportunityName: { $ifNull: [{ $first: "$opp.name" }, null] },
        },
      },
      { $project: { acc: 0, opp: 0, _undated: 0 } },
    ])
    .toArray();
  return docs.map((d) => ({ ...mapActionItem(d), accountName: d.accountName, opportunityName: d.opportunityName }));
}

/** Origin of an action item extracted from a meeting and approved by the SA. */
export interface ActionItemOrigin {
  meetingId: ObjectId;
  excerpt: string | null;
}

export async function createActionItem(
  raw: ActionItemInput,
  actor: SessionUser,
  options: AuditOptions & { origin?: ActionItemOrigin } = {},
): Promise<ActionItem> {
  const input = actionItemInputSchema.parse(raw);
  assertEnumValue(await getEnumerations(), "priorities", "priority", input.priority);
  const { accountId, opportunityId } = await resolveLinks(input.accountId, input.opportunityId);

  const now = new Date();
  const doc: ActionItemDoc = {
    _id: new ObjectId(),
    title: input.title,
    description: input.description,
    accountId,
    opportunityId,
    meetingId: options.origin?.meetingId ?? null,
    owner: input.owner,
    dueDate: input.dueDate,
    priority: input.priority,
    status: input.status,
    source: options.origin ? { kind: "meeting", meetingId: options.origin.meetingId, excerpt: options.origin.excerpt } : { kind: "manual" },
    completedAt: input.status === "done" ? now : null,
    createdAt: now,
    updatedAt: now,
  };
  const { actionItems } = await collections();
  await actionItems.insertOne(doc);
  if (accountId) {
    await recordChange({
      accountId,
      entityType: "action_item",
      entityId: doc._id,
      entityLabel: doc.title,
      action: "create",
      changes: diffObjects(null, doc as unknown as Record<string, unknown>, AUDITED_FIELDS),
      actor,
      actorKind: options.actorKind,
    });
  }
  return mapActionItem(doc);
}

export async function updateActionItem(id: string, raw: Partial<ActionItemInput>, actor: SessionUser): Promise<ActionItem> {
  const input = actionItemPatchSchema.parse(raw);
  const _id = toObjectId(id, "Action item");
  const { actionItems } = await collections();
  const before = await actionItems.findOne({ _id });
  if (!before) throw new NotFoundError("Action item");
  if (input.priority !== undefined) {
    assertEnumValue(await getEnumerations(), "priorities", "priority", input.priority, before.priority);
  }

  const { accountId: rawAccountId, opportunityId: rawOpportunityId, ...rest } = input;
  const set: Partial<ActionItemDoc> = { ...rest, updatedAt: new Date() };
  if (rawAccountId !== undefined || rawOpportunityId !== undefined) {
    const links = await resolveLinks(
      rawAccountId !== undefined ? rawAccountId : idString(before.accountId),
      rawOpportunityId !== undefined ? rawOpportunityId : idString(before.opportunityId),
    );
    set.accountId = links.accountId;
    set.opportunityId = links.opportunityId;
  }
  if (input.status !== undefined && input.status !== before.status) {
    set.completedAt = input.status === "done" ? new Date() : null;
  }

  const after = await actionItems.findOneAndUpdate({ _id }, { $set: set }, { returnDocument: "after" });
  if (!after) throw new NotFoundError("Action item");
  const accountId = after.accountId ?? before.accountId;
  if (accountId) {
    await recordChange({
      accountId,
      entityType: "action_item",
      entityId: _id,
      entityLabel: after.title,
      action: "update",
      changes: diffObjects(before as unknown as Record<string, unknown>, set as Record<string, unknown>, AUDITED_FIELDS),
      actor,
    });
  }
  return mapActionItem(after);
}

export async function deleteActionItem(id: string, actor: SessionUser): Promise<void> {
  const _id = toObjectId(id, "Action item");
  const { actionItems } = await collections();
  const doc = await actionItems.findOneAndDelete({ _id });
  if (!doc) throw new NotFoundError("Action item");
  if (doc.accountId) {
    await recordChange({ accountId: doc.accountId, entityType: "action_item", entityId: _id, entityLabel: doc.title, action: "delete", changes: [], actor });
  }
}

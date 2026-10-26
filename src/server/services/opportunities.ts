import "server-only";
import { randomUUID } from "node:crypto";
import { ObjectId, type Filter } from "mongodb";
import type { SessionUser } from "@/domain/auth";
import { getFieldDef, type DiscoveryItemInput } from "@/domain/discovery";
import {
  MAX_SOLUTION_FIT_ENTRIES,
  opportunityCreateSchema,
  opportunityPatchSchema,
  solutionFitInputSchema,
  solutionFitPatchSchema,
  type Opportunity,
  type OpportunityInput,
  type OpportunityListItem,
  type SolutionFitInput,
} from "@/domain/entities";
import type { Enumerations } from "@/domain/enumerations";
import { collections } from "@/server/db/collections";
import { idString, toObjectId, toObjectIdOrNull } from "@/server/db/ids";
import type { OpportunityDoc, SolutionFitDoc } from "@/server/db/types";
import { NotFoundError, ValidationError } from "@/server/http/errors";
import { touchAccount } from "./accounts";
import { mapDiscoveryValues, mergeDiscoveryItems, summarizeItems } from "./discovery";
import { diffObjects, recordChange, type AuditOptions } from "./history";
import { assertEnumValue, getEnumerations } from "./settings";

const AUDITED_FIELDS = [
  "name",
  "aeId",
  "salesMotion",
  "tigerRoute",
  "stage",
  "estimatedTimeline",
  "expectedWorkload",
  "description",
  "businessPriority",
  "technicalComplexity",
  "nextMilestone",
] as const;

export function mapOpportunity(doc: OpportunityDoc): Opportunity {
  return {
    id: doc._id.toHexString(),
    accountId: doc.accountId.toHexString(),
    name: doc.name,
    aeId: idString(doc.aeId),
    salesMotion: doc.salesMotion,
    tigerRoute: doc.tigerRoute,
    stage: doc.stage,
    estimatedTimeline: doc.estimatedTimeline,
    expectedWorkload: doc.expectedWorkload,
    description: doc.description,
    businessPriority: doc.businessPriority,
    technicalComplexity: doc.technicalComplexity,
    nextMilestone: doc.nextMilestone ?? { title: null, dueDate: null },
    discovery: mapDiscoveryValues(doc.discovery),
    solutionFit: doc.solutionFit ?? [],
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function validateClassification(enums: Enumerations, input: Partial<OpportunityInput>, before?: OpportunityDoc) {
  assertEnumValue(enums, "salesMotions", "salesMotion", input.salesMotion, before?.salesMotion);
  assertEnumValue(enums, "tigerRoutes", "tigerRoute", input.tigerRoute, before?.tigerRoute);
  assertEnumValue(enums, "opportunityStages", "stage", input.stage, before?.stage);
  assertEnumValue(enums, "priorities", "businessPriority", input.businessPriority, before?.businessPriority);
  assertEnumValue(enums, "complexities", "technicalComplexity", input.technicalComplexity, before?.technicalComplexity);
}

export interface OpportunityFilter {
  accountId?: string | null;
  aeId?: string | null;
  salesMotion?: string | null;
}

export async function listOpportunities(filter: OpportunityFilter = {}): Promise<OpportunityListItem[]> {
  const { opportunities } = await collections();
  const match: Filter<OpportunityDoc> = {};
  if (filter.accountId) match.accountId = toObjectId(filter.accountId, "Account");
  if (filter.aeId) match.aeId = toObjectId(filter.aeId, "Account executive");
  if (filter.salesMotion) match.salesMotion = filter.salesMotion;

  const docs = await opportunities
    .aggregate<OpportunityDoc & { accountName: string; aeName: string | null }>([
      { $match: match },
      { $sort: { updatedAt: -1 } },
      { $lookup: { from: "accounts", localField: "accountId", foreignField: "_id", pipeline: [{ $project: { name: 1 } }], as: "acc" } },
      { $lookup: { from: "account_executives", localField: "aeId", foreignField: "_id", pipeline: [{ $project: { name: 1 } }], as: "ae" } },
      {
        $addFields: {
          accountName: { $ifNull: [{ $first: "$acc.name" }, "Unknown account"] },
          aeName: { $ifNull: [{ $first: "$ae.name" }, null] },
        },
      },
      { $project: { acc: 0, ae: 0 } },
    ])
    .toArray();
  return docs.map((d) => ({ ...mapOpportunity(d), accountName: d.accountName, aeName: d.aeName }));
}

/** Lightweight list for selects. */
export async function listOpportunityOptions(): Promise<{ id: string; name: string; accountId: string }[]> {
  const { opportunities } = await collections();
  const docs = await opportunities.find({}, { projection: { name: 1, accountId: 1 } }).sort({ name: 1 }).toArray();
  return docs.map((d) => ({ id: d._id.toHexString(), name: d.name, accountId: d.accountId.toHexString() }));
}

export async function getOpportunity(id: string): Promise<Opportunity> {
  const { opportunities } = await collections();
  const doc = await opportunities.findOne({ _id: toObjectId(id, "Opportunity") });
  if (!doc) throw new NotFoundError("Opportunity");
  return mapOpportunity(doc);
}

export async function createOpportunity(raw: OpportunityInput & { accountId: string }, actor: SessionUser): Promise<Opportunity> {
  const input = opportunityCreateSchema.parse(raw);
  const accountId = toObjectId(input.accountId, "Account");
  const { accounts, opportunities } = await collections();
  const account = await accounts.findOne({ _id: accountId }, { projection: { aeId: 1 } });
  if (!account) throw new NotFoundError("Account");
  validateClassification(await getEnumerations(), input);

  const { nextMilestoneTitle, nextMilestoneDate, accountId: _ignored, aeId, ...rest } = input;
  void _ignored;
  const now = new Date();
  const doc: OpportunityDoc = {
    _id: new ObjectId(),
    ...rest,
    accountId,
    // Default to the account's AE when none is chosen explicitly.
    aeId: aeId ? toObjectId(aeId, "Account executive") : (account.aeId ?? null),
    nextMilestone: { title: nextMilestoneTitle, dueDate: nextMilestoneDate },
    discovery: {},
    solutionFit: [],
    createdAt: now,
    updatedAt: now,
  };
  await opportunities.insertOne(doc);
  await recordChange({
    accountId,
    entityType: "opportunity",
    entityId: doc._id,
    entityLabel: doc.name,
    action: "create",
    changes: diffObjects(null, doc as unknown as Record<string, unknown>, AUDITED_FIELDS),
    actor,
  });
  await touchAccount(accountId);
  return mapOpportunity(doc);
}

export async function updateOpportunity(id: string, raw: Partial<OpportunityInput>, actor: SessionUser, options: AuditOptions = {}): Promise<Opportunity> {
  const input = opportunityPatchSchema.parse(raw);
  const _id = toObjectId(id, "Opportunity");
  const { opportunities } = await collections();
  const before = await opportunities.findOne({ _id });
  if (!before) throw new NotFoundError("Opportunity");
  validateClassification(await getEnumerations(), input, before);

  const { nextMilestoneTitle, nextMilestoneDate, aeId, ...rest } = input;
  const set: Partial<OpportunityDoc> = { ...rest, updatedAt: new Date() };
  if (aeId !== undefined) set.aeId = toObjectIdOrNull(aeId, "Account executive");
  if (nextMilestoneTitle !== undefined || nextMilestoneDate !== undefined) {
    set.nextMilestone = {
      title: nextMilestoneTitle !== undefined ? nextMilestoneTitle : before.nextMilestone?.title ?? null,
      dueDate: nextMilestoneDate !== undefined ? nextMilestoneDate : before.nextMilestone?.dueDate ?? null,
    };
  }
  const after = await opportunities.findOneAndUpdate({ _id }, { $set: set }, { returnDocument: "after" });
  if (!after) throw new NotFoundError("Opportunity");
  await recordChange({
    accountId: before.accountId,
    entityType: "opportunity",
    entityId: _id,
    entityLabel: after.name,
    action: "update",
    changes: diffObjects(before as unknown as Record<string, unknown>, set as Record<string, unknown>, AUDITED_FIELDS),
    actor,
    actorKind: options.actorKind,
  });
  await touchAccount(before.accountId);
  return mapOpportunity(after);
}

/** Deletes the opportunity and its workloads; notes and action items are kept but unlinked. */
export async function deleteOpportunity(id: string, actor: SessionUser): Promise<void> {
  const _id = toObjectId(id, "Opportunity");
  const c = await collections();
  const doc = await c.opportunities.findOneAndDelete({ _id });
  if (!doc) throw new NotFoundError("Opportunity");
  const now = new Date();
  await Promise.all([
    c.workloads.deleteMany({ opportunityId: _id }),
    c.notes.updateMany({ opportunityId: _id }, { $set: { opportunityId: null, updatedAt: now } }),
    c.actionItems.updateMany({ opportunityId: _id }, { $set: { opportunityId: null, updatedAt: now } }),
  ]);
  await recordChange({
    accountId: doc.accountId,
    entityType: "opportunity",
    entityId: _id,
    entityLabel: doc.name,
    action: "delete",
    changes: [],
    actor,
  });
  await touchAccount(doc.accountId);
}

export async function updateDiscoveryField(
  opportunityId: string,
  fieldKey: string,
  items: DiscoveryItemInput[],
  actor: SessionUser,
): Promise<Opportunity> {
  const def = getFieldDef(fieldKey, "opportunity");
  if (!def) throw new NotFoundError("Field");
  const _id = toObjectId(opportunityId, "Opportunity");
  const { opportunities } = await collections();
  const before = await opportunities.findOne({ _id });
  if (!before) throw new NotFoundError("Opportunity");

  const merged = mergeDiscoveryItems(def, before.discovery?.[fieldKey], items);
  const after = await opportunities.findOneAndUpdate(
    { _id },
    { $set: { [`discovery.${fieldKey}`]: merged, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!after) throw new NotFoundError("Opportunity");
  const path = `discovery.${fieldKey}`;
  await recordChange({
    accountId: before.accountId,
    entityType: "opportunity",
    entityId: _id,
    entityLabel: after.name,
    action: "update",
    changes: diffObjects({ [path]: summarizeItems(before.discovery?.[fieldKey]) }, { [path]: summarizeItems(merged) }, [path]),
    actor,
  });
  await touchAccount(before.accountId);
  return mapOpportunity(after);
}

// ---------------------------------------------------------------------------
// Solution fit
// ---------------------------------------------------------------------------

const SOLUTION_FIT_FIELDS = [
  "capability",
  "problem",
  "proposedSolution",
  "justification",
  "businessValue",
  "limitations",
  "validation",
  "status",
] as const;

export async function addSolutionFit(
  opportunityId: string,
  raw: SolutionFitInput,
  actor: SessionUser,
  options: AuditOptions = {},
): Promise<Opportunity> {
  const input = solutionFitInputSchema.parse(raw);
  assertEnumValue(await getEnumerations(), "mongodbCapabilities", "capability", input.capability);
  const _id = toObjectId(opportunityId, "Opportunity");
  const now = new Date();
  const entry: SolutionFitDoc = { id: randomUUID(), ...input, createdAt: now, updatedAt: now };
  const { opportunities } = await collections();
  const after = await opportunities.findOneAndUpdate(
    // Bounded array: refuse to grow beyond the cap.
    { _id, [`solutionFit.${MAX_SOLUTION_FIT_ENTRIES - 1}`]: { $exists: false } },
    { $push: { solutionFit: entry }, $set: { updatedAt: now } },
    { returnDocument: "after" },
  );
  if (!after) {
    if (await opportunities.countDocuments({ _id }, { limit: 1 })) {
      throw new ValidationError(`An opportunity can hold at most ${MAX_SOLUTION_FIT_ENTRIES} solution fit entries`);
    }
    throw new NotFoundError("Opportunity");
  }
  await recordChange({
    accountId: after.accountId,
    entityType: "opportunity",
    entityId: _id,
    entityLabel: after.name,
    action: "update",
    changes: [{ field: `solutionFit.${input.capability}`, from: null, to: input.status }],
    actor,
    actorKind: options.actorKind,
  });
  return mapOpportunity(after);
}

export async function updateSolutionFit(
  opportunityId: string,
  entryId: string,
  raw: Partial<SolutionFitInput>,
  actor: SessionUser,
): Promise<Opportunity> {
  const input = solutionFitPatchSchema.parse(raw);
  const _id = toObjectId(opportunityId, "Opportunity");
  const { opportunities } = await collections();
  const before = await opportunities.findOne({ _id, "solutionFit.id": entryId });
  const prior = before?.solutionFit.find((e) => e.id === entryId);
  if (!before || !prior) throw new NotFoundError("Solution fit entry");
  if (input.capability !== undefined) {
    assertEnumValue(await getEnumerations(), "mongodbCapabilities", "capability", input.capability, prior.capability);
  }
  const now = new Date();
  const set = Object.fromEntries(Object.entries(input).map(([k, v]) => [`solutionFit.$.${k}`, v]));
  const after = await opportunities.findOneAndUpdate(
    { _id, "solutionFit.id": entryId },
    { $set: { ...set, "solutionFit.$.updatedAt": now, updatedAt: now } },
    { returnDocument: "after" },
  );
  if (!after) throw new NotFoundError("Solution fit entry");
  await recordChange({
    accountId: before.accountId,
    entityType: "opportunity",
    entityId: _id,
    entityLabel: after.name,
    action: "update",
    changes: diffObjects(prior as unknown as Record<string, unknown>, input as Record<string, unknown>, SOLUTION_FIT_FIELDS).map(
      (c) => ({ ...c, field: `solutionFit.${prior.capability}.${c.field}` }),
    ),
    actor,
  });
  return mapOpportunity(after);
}

export async function removeSolutionFit(opportunityId: string, entryId: string, actor: SessionUser): Promise<Opportunity> {
  const _id = toObjectId(opportunityId, "Opportunity");
  const { opportunities } = await collections();
  const before = await opportunities.findOne({ _id, "solutionFit.id": entryId });
  const prior = before?.solutionFit.find((e) => e.id === entryId);
  if (!before || !prior) throw new NotFoundError("Solution fit entry");
  const after = await opportunities.findOneAndUpdate(
    { _id },
    { $pull: { solutionFit: { id: entryId } }, $set: { updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!after) throw new NotFoundError("Opportunity");
  await recordChange({
    accountId: before.accountId,
    entityType: "opportunity",
    entityId: _id,
    entityLabel: after.name,
    action: "update",
    changes: [{ field: `solutionFit.${prior.capability}`, from: prior.status, to: null }],
    actor,
  });
  return mapOpportunity(after);
}

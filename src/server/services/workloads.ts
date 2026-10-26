import "server-only";
import { ObjectId } from "mongodb";
import type { SessionUser } from "@/domain/auth";
import { workloadCreateSchema, workloadInputSchema, type Workload, type WorkloadInput } from "@/domain/entities";
import { collections } from "@/server/db/collections";
import { toObjectId } from "@/server/db/ids";
import type { WorkloadDoc } from "@/server/db/types";
import { NotFoundError } from "@/server/http/errors";
import { touchAccount } from "./accounts";
import { diffObjects, recordChange } from "./history";

const AUDITED_FIELDS = Object.keys(workloadInputSchema.shape);

function mapWorkload(doc: WorkloadDoc): Workload {
  const { _id, accountId, opportunityId, ...rest } = doc;
  return { id: _id.toHexString(), accountId: accountId.toHexString(), opportunityId: opportunityId.toHexString(), ...rest };
}

export async function listWorkloads(filter: { accountId?: string; opportunityId?: string }): Promise<Workload[]> {
  const { workloads } = await collections();
  const query: Partial<Pick<WorkloadDoc, "accountId" | "opportunityId">> = {};
  if (filter.accountId) query.accountId = toObjectId(filter.accountId, "Account");
  if (filter.opportunityId) query.opportunityId = toObjectId(filter.opportunityId, "Opportunity");
  const docs = await workloads.find(query).sort({ name: 1 }).toArray();
  return docs.map(mapWorkload);
}

export async function createWorkload(raw: WorkloadInput & { opportunityId: string }, actor: SessionUser): Promise<Workload> {
  const input = workloadCreateSchema.parse(raw);
  const opportunityId = toObjectId(input.opportunityId, "Opportunity");
  const { opportunities, workloads } = await collections();
  const opp = await opportunities.findOne({ _id: opportunityId }, { projection: { accountId: 1 } });
  if (!opp) throw new NotFoundError("Opportunity");

  const now = new Date();
  const doc: WorkloadDoc = { _id: new ObjectId(), ...input, opportunityId, accountId: opp.accountId, createdAt: now, updatedAt: now };
  await workloads.insertOne(doc);
  await recordChange({
    accountId: opp.accountId,
    entityType: "workload",
    entityId: doc._id,
    entityLabel: doc.name,
    action: "create",
    changes: diffObjects(null, doc as unknown as Record<string, unknown>, AUDITED_FIELDS),
    actor,
  });
  await touchAccount(opp.accountId);
  return mapWorkload(doc);
}

export async function updateWorkload(id: string, raw: Partial<WorkloadInput>, actor: SessionUser): Promise<Workload> {
  const input = workloadInputSchema.partial().parse(raw);
  const _id = toObjectId(id, "Workload");
  const { workloads } = await collections();
  const before = await workloads.findOne({ _id });
  if (!before) throw new NotFoundError("Workload");
  const after = await workloads.findOneAndUpdate({ _id }, { $set: { ...input, updatedAt: new Date() } }, { returnDocument: "after" });
  if (!after) throw new NotFoundError("Workload");
  await recordChange({
    accountId: before.accountId,
    entityType: "workload",
    entityId: _id,
    entityLabel: after.name,
    action: "update",
    changes: diffObjects(before as unknown as Record<string, unknown>, input as Record<string, unknown>, AUDITED_FIELDS),
    actor,
  });
  await touchAccount(before.accountId);
  return mapWorkload(after);
}

export async function deleteWorkload(id: string, actor: SessionUser): Promise<void> {
  const _id = toObjectId(id, "Workload");
  const { workloads } = await collections();
  const doc = await workloads.findOneAndDelete({ _id });
  if (!doc) throw new NotFoundError("Workload");
  await recordChange({
    accountId: doc.accountId,
    entityType: "workload",
    entityId: _id,
    entityLabel: doc.name,
    action: "delete",
    changes: [],
    actor,
  });
}

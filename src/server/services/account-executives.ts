import "server-only";
import { ObjectId } from "mongodb";
import type { SessionUser } from "@/domain/auth";
import {
  accountExecutiveInputSchema,
  type AccountExecutive,
  type AccountExecutiveInput,
  type AccountExecutiveSummary,
} from "@/domain/entities";
import { collections } from "@/server/db/collections";
import { toObjectId } from "@/server/db/ids";
import type { AccountExecutiveDoc } from "@/server/db/types";
import { NotFoundError } from "@/server/http/errors";
import { recordChange } from "./history";
import { getEnumerations } from "./settings";

export function mapAccountExecutive(doc: AccountExecutiveDoc): AccountExecutive {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    email: doc.email,
    territory: doc.territory,
    region: doc.region,
    notes: doc.notes,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export async function listAccountExecutives(): Promise<AccountExecutiveSummary[]> {
  const { accountExecutives } = await collections();
  const { closedStages } = await getEnumerations();
  const docs = await accountExecutives
    .aggregate<AccountExecutiveDoc & { accountCount: number; activeOpportunityCount: number }>([
      { $sort: { name: 1 } },
      {
        $lookup: {
          from: "accounts",
          localField: "_id",
          foreignField: "aeId",
          pipeline: [{ $count: "n" }],
          as: "accountAgg",
        },
      },
      {
        $lookup: {
          from: "opportunities",
          localField: "_id",
          foreignField: "aeId",
          pipeline: [{ $match: { stage: { $nin: closedStages } } }, { $count: "n" }],
          as: "oppAgg",
        },
      },
      {
        $addFields: {
          accountCount: { $ifNull: [{ $first: "$accountAgg.n" }, 0] },
          activeOpportunityCount: { $ifNull: [{ $first: "$oppAgg.n" }, 0] },
        },
      },
      { $project: { accountAgg: 0, oppAgg: 0 } },
    ])
    .toArray();
  return docs.map((d) => ({
    ...mapAccountExecutive(d),
    accountCount: d.accountCount,
    activeOpportunityCount: d.activeOpportunityCount,
  }));
}

/** Lightweight list for selects. */
export async function listAccountExecutiveOptions(): Promise<{ id: string; name: string }[]> {
  const { accountExecutives } = await collections();
  const docs = await accountExecutives.find({}, { projection: { name: 1 } }).sort({ name: 1 }).toArray();
  return docs.map((d) => ({ id: d._id.toHexString(), name: d.name }));
}

export async function getAccountExecutive(id: string): Promise<AccountExecutive> {
  const { accountExecutives } = await collections();
  const doc = await accountExecutives.findOne({ _id: toObjectId(id, "Account executive") });
  if (!doc) throw new NotFoundError("Account executive");
  return mapAccountExecutive(doc);
}

export async function createAccountExecutive(raw: AccountExecutiveInput): Promise<AccountExecutive> {
  const input = accountExecutiveInputSchema.parse(raw);
  const { accountExecutives } = await collections();
  const now = new Date();
  const doc: AccountExecutiveDoc = { _id: new ObjectId(), ...input, createdAt: now, updatedAt: now };
  await accountExecutives.insertOne(doc);
  return mapAccountExecutive(doc);
}

export async function updateAccountExecutive(id: string, raw: Partial<AccountExecutiveInput>): Promise<AccountExecutive> {
  const input = accountExecutiveInputSchema.partial().parse(raw);
  const { accountExecutives } = await collections();
  const doc = await accountExecutives.findOneAndUpdate(
    { _id: toObjectId(id, "Account executive") },
    { $set: { ...input, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!doc) throw new NotFoundError("Account executive");
  return mapAccountExecutive(doc);
}

/** Deleting an AE unassigns it from accounts and opportunities; nothing else is removed. */
export async function deleteAccountExecutive(id: string, actor: SessionUser): Promise<void> {
  const _id = toObjectId(id, "Account executive");
  const { accountExecutives, accounts, opportunities } = await collections();
  const ae = await accountExecutives.findOneAndDelete({ _id });
  if (!ae) throw new NotFoundError("Account executive");
  const affected = await accounts.find({ aeId: _id }, { projection: { name: 1 } }).toArray();
  const now = new Date();
  await accounts.updateMany({ aeId: _id }, { $set: { aeId: null, updatedAt: now } });
  await opportunities.updateMany({ aeId: _id }, { $set: { aeId: null, updatedAt: now } });
  for (const account of affected) {
    await recordChange({
      accountId: account._id,
      entityType: "account",
      entityId: account._id,
      entityLabel: account.name,
      action: "update",
      changes: [{ field: "aeId", from: `${ae.name} (deleted)`, to: null }],
      actor,
    });
  }
}

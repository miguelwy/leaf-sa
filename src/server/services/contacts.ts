import "server-only";
import { ObjectId } from "mongodb";
import type { SessionUser } from "@/domain/auth";
import { contactInputSchema, contactPatchSchema, type Contact, type ContactInput } from "@/domain/entities";
import { collections } from "@/server/db/collections";
import { toObjectId } from "@/server/db/ids";
import type { ContactDoc } from "@/server/db/types";
import { NotFoundError } from "@/server/http/errors";
import { touchAccount } from "./accounts";
import { diffObjects, recordChange, type AuditOptions } from "./history";
import { assertEnumValue, getEnumerations } from "./settings";

const AUDITED_FIELDS = ["name", "title", "email", "phone", "persona", "isPrimary", "notes"] as const;

function mapContact(doc: ContactDoc): Contact {
  return {
    id: doc._id.toHexString(),
    accountId: doc.accountId.toHexString(),
    name: doc.name,
    title: doc.title,
    email: doc.email,
    phone: doc.phone,
    persona: doc.persona,
    isPrimary: doc.isPrimary,
    notes: doc.notes,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export async function listContacts(accountId: string): Promise<Contact[]> {
  const { contacts } = await collections();
  const docs = await contacts
    .find({ accountId: toObjectId(accountId, "Account") })
    .sort({ isPrimary: -1, name: 1 })
    .toArray();
  return docs.map(mapContact);
}

export async function createContact(
  accountId: string,
  raw: ContactInput,
  actor: SessionUser,
  options: AuditOptions = {},
): Promise<Contact> {
  const input = contactInputSchema.parse(raw);
  const accountOid = toObjectId(accountId, "Account");
  const { accounts, contacts } = await collections();
  if (!(await accounts.countDocuments({ _id: accountOid }, { limit: 1 }))) throw new NotFoundError("Account");
  assertEnumValue(await getEnumerations(), "contactPersonas", "persona", input.persona);

  const now = new Date();
  const doc: ContactDoc = { _id: new ObjectId(), accountId: accountOid, ...input, createdAt: now, updatedAt: now };
  await contacts.insertOne(doc);
  await recordChange({
    accountId: accountOid,
    entityType: "contact",
    entityId: doc._id,
    entityLabel: doc.name,
    action: "create",
    changes: diffObjects(null, doc as unknown as Record<string, unknown>, AUDITED_FIELDS),
    actor,
    actorKind: options.actorKind,
  });
  await touchAccount(accountOid);
  return mapContact(doc);
}

export async function updateContact(id: string, raw: Partial<ContactInput>, actor: SessionUser): Promise<Contact> {
  const input = contactPatchSchema.parse(raw);
  const _id = toObjectId(id, "Contact");
  const { contacts } = await collections();
  const before = await contacts.findOne({ _id });
  if (!before) throw new NotFoundError("Contact");
  if (input.persona !== undefined) {
    assertEnumValue(await getEnumerations(), "contactPersonas", "persona", input.persona, before.persona);
  }
  const after = await contacts.findOneAndUpdate(
    { _id },
    { $set: { ...input, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!after) throw new NotFoundError("Contact");
  await recordChange({
    accountId: before.accountId,
    entityType: "contact",
    entityId: _id,
    entityLabel: after.name,
    action: "update",
    changes: diffObjects(before as unknown as Record<string, unknown>, input as Record<string, unknown>, AUDITED_FIELDS),
    actor,
  });
  return mapContact(after);
}

export async function deleteContact(id: string, actor: SessionUser): Promise<void> {
  const _id = toObjectId(id, "Contact");
  const { contacts } = await collections();
  const doc = await contacts.findOneAndDelete({ _id });
  if (!doc) throw new NotFoundError("Contact");
  await recordChange({
    accountId: doc.accountId,
    entityType: "contact",
    entityId: _id,
    entityLabel: doc.name,
    action: "delete",
    changes: [],
    actor,
  });
}

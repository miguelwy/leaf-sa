import { describe, expect, it } from "vitest";
import { createAccountExecutive, deleteAccountExecutive, listAccountExecutives } from "@/server/services/account-executives";
import {
  createAccount,
  deleteAccount,
  getAccount,
  listAccounts,
  updateAccount,
  updateTechStackField,
} from "@/server/services/accounts";
import { createContact, listContacts } from "@/server/services/contacts";
import { listAccountHistory } from "@/server/services/history";
import { createNote } from "@/server/services/notes";
import { createOpportunity } from "@/server/services/opportunities";
import { updateEnumeration } from "@/server/services/settings";
import { collections } from "@/server/db/collections";
import { actor } from "./helpers";

describe("accounts service", () => {
  it("creates an account with an AE and records a create history entry", async () => {
    const ae = await createAccountExecutive({ name: "Dana AE", email: "Dana@Example.com", territory: "Enterprise" });
    expect(ae.email).toBe("dana@example.com");

    const account = await createAccount({ name: "Globex", status: "Active", aeId: ae.id, website: "globex.com" }, actor);
    expect(account.aeId).toBe(ae.id);
    expect(account.website).toBe("https://globex.com");

    const history = await listAccountHistory(account.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ action: "create", entityType: "account", actor: { kind: "user", name: "Test SA" } });

    const list = await listAccounts({ aeId: ae.id });
    expect(list.map((a) => a.name)).toEqual(["Globex"]);
    expect(list[0].aeName).toBe("Dana AE");
  });

  it("rejects duplicate names case-insensitively", async () => {
    await createAccount({ name: "Initech", status: "Active" }, actor);
    await expect(createAccount({ name: "initech", status: "Active" }, actor)).rejects.toMatchObject({ code: "conflict" });
  });

  it("validates status against configured enumerations", async () => {
    await expect(createAccount({ name: "Umbrella", status: "Imaginary" }, actor)).rejects.toMatchObject({
      code: "validation_failed",
    });
  });

  it("keeps a value that was removed from the enumeration when editing other fields", async () => {
    await updateEnumeration({ kind: "accountStatuses", values: ["Prospect", "Active", "Legacy"] });
    const account = await createAccount({ name: "Hooli", status: "Legacy" }, actor);
    await updateEnumeration({ kind: "accountStatuses", values: ["Prospect", "Active"] });
    const updated = await updateAccount(account.id, { status: "Legacy", region: "EMEA" }, actor);
    expect(updated.region).toBe("EMEA");
    await expect(updateAccount(account.id, { status: "Gone" }, actor)).rejects.toMatchObject({ code: "validation_failed" });
    await updateEnumeration({ kind: "accountStatuses", values: ["Prospect", "Active", "On Hold", "Inactive"] });
  });

  it("records field-level diffs on update", async () => {
    const account = await createAccount({ name: "Stark", status: "Prospect" }, actor);
    await updateAccount(account.id, { status: "Active", industry: "Manufacturing", nextMeetingAt: "2026-11-02T14:00:00Z" }, actor);
    const [latest] = await listAccountHistory(account.id);
    expect(latest.action).toBe("update");
    expect(latest.changes).toHaveLength(3);
    expect(latest.changes).toEqual(
      expect.arrayContaining([
        { field: "status", from: "Prospect", to: "Active" },
        { field: "industry", from: null, to: "Manufacturing" },
        { field: "nextMeetingAt", from: null, to: "2026-11-02T14:00:00.000Z" },
      ]),
    );
  });

  it("updates technology stack items with provenance", async () => {
    const account = await createAccount({ name: "Wayne", status: "Active" }, actor);
    const first = await updateTechStackField(account.id, "currentDatabases", [{ text: "PostgreSQL 13" }, { text: "Redis" }], actor);
    const items = first.techStack.currentDatabases!;
    expect(items).toHaveLength(2);
    expect(items[0].source).toEqual({ kind: "manual" });

    const second = await updateTechStackField(account.id, "currentDatabases", [{ id: items[0].id, text: "PostgreSQL 15" }], actor);
    expect(second.techStack.currentDatabases).toHaveLength(1);
    expect(second.techStack.currentDatabases![0]).toMatchObject({ id: items[0].id, text: "PostgreSQL 15" });

    await expect(updateTechStackField(account.id, "painPoints", [], actor)).rejects.toMatchObject({ code: "not_found" });
  });

  it("deletes an account and all of its records", async () => {
    const account = await createAccount({ name: "Cyberdyne", status: "Active" }, actor);
    await createContact(account.id, { name: "Miles", isPrimary: true }, actor);
    await createOpportunity({ accountId: account.id, name: "Skynet migration" }, actor);
    await createNote({ accountId: account.id, title: "Kickoff", body: "notes" }, actor);
    await deleteAccount(account.id);

    await expect(getAccount(account.id)).rejects.toMatchObject({ code: "not_found" });
    const c = await collections();
    const { ObjectId } = await import("mongodb");
    const _id = new ObjectId(account.id);
    expect(await c.contacts.countDocuments({ accountId: _id })).toBe(0);
    expect(await c.opportunities.countDocuments({ accountId: _id })).toBe(0);
    expect(await c.notes.countDocuments({ accountId: _id })).toBe(0);
    expect(await c.history.countDocuments({ accountId: _id })).toBe(0);
  });

  it("lists contacts primary first", async () => {
    const account = await createAccount({ name: "Tyrell", status: "Active" }, actor);
    await createContact(account.id, { name: "Zed" }, actor);
    await createContact(account.id, { name: "Amy", isPrimary: true, persona: "Architect" }, actor);
    await expect(createContact(account.id, { name: "Bad", persona: "Wizard" }, actor)).rejects.toMatchObject({
      code: "validation_failed",
    });
    expect((await listContacts(account.id)).map((c) => c.name)).toEqual(["Amy", "Zed"]);
    const amy = (await listContacts(account.id))[0];
    const { updateContact } = await import("@/server/services/contacts");
    const updated = await updateContact(amy.id, { title: "Chief Architect" }, actor);
    expect(updated).toMatchObject({ isPrimary: true, persona: "Architect", title: "Chief Architect" });
  });

  it("unassigns accounts when an AE is deleted and reports counts", async () => {
    const ae = await createAccountExecutive({ name: "Temp AE" });
    const account = await createAccount({ name: "Soylent", status: "Active", aeId: ae.id }, actor);
    await createOpportunity({ accountId: account.id, name: "Opp", stage: "Discovery" }, actor);
    const summary = (await listAccountExecutives()).find((a) => a.id === ae.id)!;
    expect(summary).toMatchObject({ accountCount: 1, activeOpportunityCount: 1 });

    await deleteAccountExecutive(ae.id, actor);
    expect((await getAccount(account.id)).aeId).toBeNull();
    const [latest] = await listAccountHistory(account.id);
    expect(latest.changes[0]).toMatchObject({ field: "aeId", to: null });
  });
});

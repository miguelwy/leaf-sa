import { describe, expect, it } from "vitest";
import { createAccountExecutive } from "@/server/services/account-executives";
import { createAccount } from "@/server/services/accounts";
import { createActionItem } from "@/server/services/action-items";
import { getDashboard } from "@/server/services/dashboard";
import { createNote } from "@/server/services/notes";
import { createOpportunity } from "@/server/services/opportunities";
import { search } from "@/server/services/search";
import { authenticate, needsSetup, setupOwner } from "@/server/services/users";
import { actor } from "./helpers";

describe("search", () => {
  it("finds whole words via the text index and partial words via fallback", async () => {
    const account = await createAccount({ name: "Vandelay Industries", status: "Active", description: "Importer/exporter of latex" }, actor);
    await createNote({ accountId: account.id, title: "Architecture review", body: "Discussed MongoDB change streams for CDC" }, actor);
    await createOpportunity({ accountId: account.id, name: "Latex catalog search" }, actor);

    const whole = await search({ q: "latex" });
    expect(whole.map((r) => r.type).sort()).toEqual(["account", "opportunity"]);

    const partial = await search({ q: "mongo", types: "note" });
    expect(partial).toHaveLength(1);
    expect(partial[0]).toMatchObject({ type: "note", title: "Architecture review" });
    expect(partial[0].snippet).toContain("MongoDB");
  });

  it("scopes results to an account", async () => {
    const a = await createAccount({ name: "Scope Alpha", status: "Active" }, actor);
    const b = await createAccount({ name: "Scope Beta", status: "Active" }, actor);
    await createNote({ accountId: a.id, title: "Shared keyword zebra" }, actor);
    await createNote({ accountId: b.id, title: "Shared keyword zebra" }, actor);
    const results = await search({ q: "zebra", accountId: a.id });
    expect(results).toHaveLength(1);
    expect(results[0].href).toContain(a.id);
  });
});

describe("dashboard", () => {
  it("aggregates accounts, opportunities, tasks and focus items", async () => {
    const ae = await createAccountExecutive({ name: "Dash AE" });
    const account = await createAccount({ name: "Dash Co", status: "Active", aeId: ae.id, nextMeetingAt: new Date(Date.now() + 2 * 86400000) }, actor);
    await createOpportunity({ accountId: account.id, name: "Live", salesMotion: "Launch", stage: "Discovery" }, actor);
    await createOpportunity({ accountId: account.id, name: "Closed", salesMotion: "Launch", stage: "Closed Won" }, actor);
    await createActionItem({ title: "Late task", accountId: account.id, dueDate: "2020-01-01" }, actor);

    const d = await getDashboard();
    expect(d.accountsByAe.find((a) => a.aeId === ae.id)?.count).toBe(1);
    expect(d.opportunitiesByMotion.find((m) => m.motion === "Launch")?.count).toBeGreaterThanOrEqual(1);
    expect(d.tasks.overdue).toBeGreaterThanOrEqual(1);
    expect(d.focus.some((f) => f.kind === "overdue_task" && f.title === "Late task")).toBe(true);
    expect(d.focus.some((f) => f.kind === "meeting")).toBe(true);
    expect(d.followUps.find((f) => f.accountId === account.id)?.reason).toBe("Overdue action items");
    expect(d.discovery.some((o) => o.name === "Closed")).toBe(false);
  });
});

describe("users", () => {
  it("allows exactly one setup and authenticates the owner", async () => {
    expect(await needsSetup()).toBe(true);
    const owner = await setupOwner({ name: "Owner", email: "Owner@Example.com", password: "correct horse battery", confirmPassword: "correct horse battery" });
    expect(owner.email).toBe("owner@example.com");
    expect(await needsSetup()).toBe(false);
    await expect(
      setupOwner({ name: "Other", email: "x@example.com", password: "another password!", confirmPassword: "another password!" }),
    ).rejects.toMatchObject({ code: "conflict" });

    await expect(authenticate({ email: "owner@example.com", password: "correct horse battery" })).resolves.toMatchObject({ id: owner.id });
    await expect(authenticate({ email: "owner@example.com", password: "wrong" })).rejects.toMatchObject({ code: "unauthorized" });
    await expect(authenticate({ email: "nobody@example.com", password: "wrong" })).rejects.toMatchObject({ code: "unauthorized" });
  });
});

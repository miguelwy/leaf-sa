/**
 * Inserts clearly-labelled DEMO data (fictional companies) so the UI can be explored.
 * Refuses to run when accounts already exist. Usage: npm run db:seed
 */
import type { SessionUser } from "@/domain/auth";
import { collections } from "@/server/db/collections";
import { closeDb } from "@/server/db/client";
import { createAccountExecutive } from "@/server/services/account-executives";
import { createAccount, updateTechStackField } from "@/server/services/accounts";
import { createActionItem } from "@/server/services/action-items";
import { createContact } from "@/server/services/contacts";
import { createNote } from "@/server/services/notes";
import { addSolutionFit, createOpportunity, updateDiscoveryField } from "@/server/services/opportunities";
import { createWorkload } from "@/server/services/workloads";

const DAY = 86400000;
const inDays = (n: number) => new Date(Date.now() + n * DAY);
const dateOnly = (n: number) => inDays(n).toISOString().slice(0, 10);

async function main() {
  const c = await collections();
  if (await c.accounts.countDocuments({}, { limit: 1 })) {
    console.log("Accounts already exist; seed skipped.");
    return;
  }
  const owner = await c.users.findOne({ role: "owner" });
  const actor: SessionUser = owner
    ? { id: owner._id.toHexString(), email: owner.email, name: owner.name }
    : { id: "000000000000000000000000", email: "seed@localhost", name: "Demo seed" };

  const ae = await createAccountExecutive({ name: "Demo AE — Jordan Lee", email: "jordan.lee@example.com", territory: "Enterprise", region: "EMEA" });
  const account = await createAccount(
    {
      name: "[Demo] Northwind Retail",
      status: "Active",
      aeId: ae.id,
      industry: "Retail",
      region: "EMEA",
      website: "northwind.example",
      description: "Fictional omnichannel retailer used as demo data.",
      nextMeetingAt: inDays(3),
      lastInteractionAt: inDays(-6),
    },
    actor,
  );
  await createContact(account.id, { name: "Alex Rivera", title: "VP Engineering", persona: "Engineering Leadership", isPrimary: true }, actor);
  await updateTechStackField(account.id, "currentDatabases", [{ text: "PostgreSQL 13 (catalog)" }, { text: "Redis (sessions)" }], actor);
  await updateTechStackField(account.id, "cloudProviders", [{ text: "AWS" }], actor);

  const migration = await createOpportunity(
    {
      accountId: account.id,
      name: "Catalog platform modernisation",
      salesMotion: "Migrate",
      tigerRoute: "Classic",
      stage: "Discovery",
      businessPriority: "High",
      technicalComplexity: "Medium",
      nextMilestoneTitle: "Architecture workshop",
      nextMilestoneDate: dateOnly(5),
    },
    actor,
  );
  await updateDiscoveryField(migration.id, "painPoints", [{ text: "Schema changes to the catalog take weeks" }, { text: "Nightly ETL misses SLA", status: "tentative" }], actor);
  await updateDiscoveryField(migration.id, "businessDrivers", [{ text: "Faster product launches" }], actor);
  await createWorkload({ opportunityId: migration.id, name: "Catalog API", latency: "Unknown — to confirm", dataVolume: "~2 TB (customer estimate)" }, actor);
  await addSolutionFit(migration.id, { capability: "Atlas Search", problem: "Search relevance complaints on catalog (to validate)", status: "Identified" }, actor);

  await createOpportunity({ accountId: account.id, name: "Support assistant (RAG)", salesMotion: "Launch", stage: "Qualification" }, actor);
  await createNote(
    {
      accountId: account.id,
      opportunityId: migration.id,
      title: "Intro call",
      body: "## Context\n\n- Catalog team frustrated with migrations\n- Wants a workshop next week\n",
      tags: ["discovery"],
      pinned: true,
    },
    actor,
  );
  await createActionItem({ title: "Send workshop agenda", accountId: account.id, opportunityId: migration.id, owner: "Me", dueDate: dateOnly(1), priority: "High" }, actor);
  console.log(`Demo data created: account "${account.name}".`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());

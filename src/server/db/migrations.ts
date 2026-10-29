import { randomUUID } from "node:crypto";
import type { Db } from "mongodb";
import { DISCOVERY_FIELD_MAP } from "@/domain/discovery";
import { MAX_FEATURES, MAX_KEY_NOTES } from "@/domain/entities";
import { COLLECTION_NAMES } from "./names";
import type { AccountDoc, DiscoveryItemDoc, FeatureDoc, ItemSourceDoc, KeyNoteDoc, OpportunityDoc } from "./types";

function noteFrom(item: DiscoveryItemDoc, key: string, prefix: string): KeyNoteDoc {
  const label = DISCOVERY_FIELD_MAP.get(key)?.label ?? key;
  const source: ItemSourceDoc = item.source.kind === "meeting" ? item.source : { kind: "migrated", from: key };
  return {
    id: randomUUID(),
    text: `${prefix}${label}: ${item.text}${item.status === "tentative" ? " (tentative)" : ""}`,
    source,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

/**
 * Simplified workspace (2026-10): copies each account's structured discovery into a flat
 * "key notes" list and its opportunities' solution fit into account-level MongoDB
 * features. Additive only: the original fields are left untouched, and each account is
 * migrated once (marked with `simplifiedAt`).
 */
export async function migrateToSimplifiedModel(db: Db): Promise<number> {
  const accounts = db.collection<AccountDoc>(COLLECTION_NAMES.accounts);
  const opportunities = db.collection<OpportunityDoc>(COLLECTION_NAMES.opportunities);
  const pending = await accounts.find({ simplifiedAt: { $exists: false } }).toArray();
  let migrated = 0;

  for (const account of pending) {
    const opps = await opportunities.find({ accountId: account._id }).sort({ createdAt: 1 }).toArray();
    const notes: KeyNoteDoc[] = [];
    for (const [key, items] of Object.entries(account.techStack ?? {})) {
      for (const item of items) notes.push(noteFrom(item, key, ""));
    }
    for (const opp of opps) {
      const prefix = opps.length > 1 ? `[${opp.name}] ` : "";
      for (const [key, items] of Object.entries(opp.discovery ?? {})) {
        if (DISCOVERY_FIELD_MAP.get(key)?.kind === "mermaid") continue; // diagrams stay on the opportunity
        for (const item of items) notes.push(noteFrom(item, key, prefix));
      }
    }

    const features: FeatureDoc[] = [];
    const seen = new Set<string>();
    for (const opp of opps) {
      for (const fit of opp.solutionFit ?? []) {
        const k = fit.capability.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        features.push({
          id: randomUUID(),
          capability: fit.capability,
          why: [fit.problem, fit.justification].filter(Boolean).join(" — ") || null,
          status: fit.status,
          source: { kind: "migrated", from: `solutionFit:${opp.name}` },
          createdAt: fit.createdAt,
          updatedAt: fit.updatedAt,
        });
      }
    }

    const res = await accounts.updateOne(
      { _id: account._id, simplifiedAt: { $exists: false } },
      {
        $set: {
          keyNotes: [...(account.keyNotes ?? []), ...notes].slice(0, MAX_KEY_NOTES),
          features: [...(account.features ?? []), ...features].slice(0, MAX_FEATURES),
          simplifiedAt: new Date(),
        },
      },
    );
    migrated += res.modifiedCount;
  }
  return migrated;
}

/** Idempotent data migrations, run once per process after schema setup. */
export async function runDataMigrations(db: Db): Promise<void> {
  const count = await migrateToSimplifiedModel(db);
  if (count) console.info(`[db] migrated ${count} account(s) to the simplified workspace model`);
}

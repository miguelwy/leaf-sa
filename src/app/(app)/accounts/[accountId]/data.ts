import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getAccount } from "@/server/services/accounts";
import { listOpportunities } from "@/server/services/opportunities";
import { NotFoundError } from "@/server/http/errors";

async function orNotFound<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

/** Request-scoped loaders shared by the account layout and its tab pages. */
export const loadAccount = cache((accountId: string) => orNotFound(() => getAccount(accountId)));

export const loadAccountOpportunities = cache((accountId: string) => orNotFound(() => listOpportunities({ accountId })));

/** Resolves the `?opp=` selection, defaulting to the most recently updated opportunity. */
export async function resolveSelectedOpportunity(accountId: string, requested?: string) {
  const opportunities = await loadAccountOpportunities(accountId);
  const selected = opportunities.find((o) => o.id === requested) ?? opportunities[0] ?? null;
  return { opportunities, selected };
}

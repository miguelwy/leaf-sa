import { randomUUID } from "node:crypto";
import type { DiscoveryFieldDef, DiscoveryItem, DiscoveryItemInput, DiscoveryValues } from "@/domain/discovery";
import { discoveryItemInputSchema } from "@/domain/discovery";
import type { DiscoveryItemDoc, DiscoveryValuesDoc, SourceDoc } from "@/server/db/types";
import { ValidationError } from "@/server/http/errors";

/**
 * Applies a full replacement list for one discovery field while preserving the
 * provenance (source, createdAt) of items that already exist. Clients can never
 * set or alter an item's source: manual edits keep the original source, new
 * items are always `manual`.
 */
export function mergeDiscoveryItems(
  def: DiscoveryFieldDef,
  existing: DiscoveryItemDoc[] | undefined,
  inputs: DiscoveryItemInput[],
  now = new Date(),
): DiscoveryItemDoc[] {
  if (def.kind !== "list" && inputs.length > 1) {
    throw new ValidationError(`"${def.label}" holds a single value`);
  }
  const byId = new Map((existing ?? []).map((item) => [item.id, item]));
  return inputs.map((raw) => {
    const input = discoveryItemInputSchema.parse(raw);
    const prior = input.id ? byId.get(input.id) : undefined;
    if (!prior) {
      return { id: randomUUID(), text: input.text, status: input.status, source: { kind: "manual" }, createdAt: now, updatedAt: now };
    }
    const changed = prior.text !== input.text || prior.status !== input.status;
    return { ...prior, text: input.text, status: input.status, updatedAt: changed ? now : prior.updatedAt };
  });
}

function mapSource(source: SourceDoc): DiscoveryItem["source"] {
  return source.kind === "meeting"
    ? { kind: "meeting", meetingId: source.meetingId.toHexString(), excerpt: source.excerpt ?? null }
    : { kind: "manual" };
}

export function mapDiscoveryValues(values: DiscoveryValuesDoc | undefined): DiscoveryValues {
  return Object.fromEntries(
    Object.entries(values ?? {}).map(([key, items]) => [key, items.map((item) => ({ ...item, source: mapSource(item.source) }))]),
  );
}

/** Compact representation used in change history entries. */
export function summarizeItems(items: DiscoveryItemDoc[] | undefined): string[] {
  return (items ?? []).map((i) => (i.status === "tentative" ? `${i.text} (tentative)` : i.text));
}

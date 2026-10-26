import "server-only";
import {
  DEFAULT_ENUMERATIONS,
  ENUMERATION_KINDS,
  ENUMERATION_META,
  type EnumerationKind,
  type Enumerations,
  type EnumerationUpdate,
} from "@/domain/enumerations";
import { collections } from "@/server/db/collections";
import { ValidationError } from "@/server/http/errors";

export async function getEnumerations(): Promise<Enumerations> {
  const { settings } = await collections();
  const doc = await settings.findOne({ _id: "enumerations" });
  const stored = doc && "values" in doc ? doc.values : undefined;
  // Fill kinds added after the settings document was first written.
  return Object.fromEntries(
    ENUMERATION_KINDS.map((kind) => [kind, stored?.[kind] ?? DEFAULT_ENUMERATIONS[kind]]),
  ) as Enumerations;
}

export async function updateEnumeration({ kind, values }: EnumerationUpdate): Promise<Enumerations> {
  const current = await getEnumerations();
  const next = { ...current, [kind]: values };
  const { settings } = await collections();
  await settings.updateOne(
    { _id: "enumerations" },
    { $set: { values: next, updatedAt: new Date() } },
    { upsert: true },
  );
  return next;
}

/**
 * Validates a classification value against its configured enumeration. A value
 * that is unchanged from `previous` is accepted even if it has since been removed
 * from the list, so editing other fields never forces a reclassification.
 */
export function assertEnumValue(
  enums: Enumerations,
  kind: EnumerationKind,
  field: string,
  value: string | null | undefined,
  previous?: string | null,
): void {
  if (value === null || value === undefined || value === previous) return;
  if (!enums[kind].includes(value)) {
    throw new ValidationError("Validation failed", {
      formErrors: [],
      fieldErrors: { [field]: [`"${value}" is not a configured ${ENUMERATION_META[kind].label.toLowerCase()} value`] },
    });
  }
}

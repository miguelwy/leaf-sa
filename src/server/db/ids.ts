import { ObjectId } from "mongodb";
import { OBJECT_ID_PATTERN } from "@/domain/common";
import { NotFoundError } from "@/server/http/errors";

/** Parses an id coming from a URL or payload; invalid ids are reported as "not found". */
export function toObjectId(id: string, entity = "Resource"): ObjectId {
  if (!OBJECT_ID_PATTERN.test(id)) throw new NotFoundError(entity);
  return new ObjectId(id);
}

export function toObjectIdOrNull(id: string | null | undefined, entity = "Resource"): ObjectId | null {
  return id ? toObjectId(id, entity) : null;
}

export function idString(id: ObjectId | null | undefined): string | null {
  return id ? id.toHexString() : null;
}

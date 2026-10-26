import bcrypt from "bcryptjs";

const COST = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

let dummyHash: Promise<string> | null = null;

/** Compared against when the user does not exist, so timing does not reveal valid emails. */
export function getDummyHash(): Promise<string> {
  dummyHash ??= bcrypt.hash("not-a-real-password", COST);
  return dummyHash;
}

import "server-only";
import { ObjectId } from "mongodb";
import { loginSchema, setupSchema, type LoginInput, type SessionUser, type SetupInput } from "@/domain/auth";
import { collections } from "@/server/db/collections";
import { getDummyHash, hashPassword, verifyPassword } from "@/server/auth/password";
import { ConflictError, UnauthorizedError } from "@/server/http/errors";

export async function needsSetup(): Promise<boolean> {
  const { settings } = await collections();
  return (await settings.countDocuments({ _id: "setup" }, { limit: 1 })) === 0;
}

/**
 * Creates the workspace owner. The `settings/setup` marker is inserted first with a
 * fixed _id, so concurrent setup attempts cannot create two owners.
 */
export async function setupOwner(raw: SetupInput): Promise<SessionUser> {
  const input = setupSchema.parse(raw);
  const { settings, users } = await collections();
  const ownerId = new ObjectId();
  try {
    await settings.insertOne({ _id: "setup", completedAt: new Date(), ownerId });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new ConflictError("Workspace is already set up");
    throw error;
  }
  const now = new Date();
  try {
    await users.insertOne({
      _id: ownerId,
      email: input.email,
      name: input.name,
      passwordHash: await hashPassword(input.password),
      role: "owner",
      lastLoginAt: now,
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    await settings.deleteOne({ _id: "setup" });
    throw error;
  }
  return { id: ownerId.toHexString(), email: input.email, name: input.name };
}

export async function authenticate(raw: LoginInput): Promise<SessionUser> {
  const input = loginSchema.parse(raw);
  const { users } = await collections();
  const user = await users.findOne({ email: input.email });
  const ok = await verifyPassword(input.password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !ok) throw new UnauthorizedError("Invalid email or password");
  await users.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
  return { id: user._id.toHexString(), email: user.email, name: user.name };
}

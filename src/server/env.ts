import "server-only";
import { z } from "zod";

const envSchema = z.object({
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  MONGODB_DB: z.string().min(1).default("sa_workspace"),
  // Validated by authSecret() so database-only scripts do not need it.
  AUTH_SECRET: z.string().optional(),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(24 * 7),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/** Parsed lazily so `next build` does not require runtime secrets. */
export function env(): Env {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Invalid environment configuration: ${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** Session signing secret; required by anything that issues or verifies sessions. */
export function authSecret(): string {
  const secret = env().AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("Invalid environment configuration: AUTH_SECRET must be set to at least 32 characters");
  }
  return secret;
}

/** Test hook: forget parsed env so tests can change process.env. */
export function resetEnvCache() {
  cached = null;
}

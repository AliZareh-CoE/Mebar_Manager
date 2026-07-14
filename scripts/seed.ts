/**
 * Seed script. Creates the first manager account (idempotent).
 * Run: npm run db:seed
 *
 * Demo data for every fight rule is added by `npm run db:seed -- --demo`.
 */
import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { db } from "../src/lib/db";
import { user, account } from "../src/lib/db/schema";

export async function createUserRaw(input: {
  name: string;
  email: string;
  password: string;
  role: "MANAGER" | "ENGINEER";
}): Promise<string> {
  const existing = await db
    .select()
    .from(user)
    .where(eq(user.email, input.email))
    .get();
  if (existing) return existing.id;

  const userId = crypto.randomUUID();
  const now = new Date();
  await db.insert(user).values({
    id: userId,
    name: input.name,
    email: input.email,
    emailVerified: true,
    role: input.role,
    createdAt: now,
    updatedAt: now,
  });
  // Credential account the way better-auth's email/password provider stores it.
  await db.insert(account).values({
    id: crypto.randomUUID(),
    accountId: userId,
    providerId: "credential",
    userId,
    password: await hashPassword(input.password),
    createdAt: now,
    updatedAt: now,
  });
  return userId;
}

async function main() {
  const email = process.env.MANAGER_EMAIL ?? "admin@lab.local";
  const password = process.env.MANAGER_PASSWORD ?? "mebar-admin";
  await createUserRaw({ name: "Lab Manager", email, password, role: "MANAGER" });
  console.log(`Manager account ready: ${email} / ${password}`);
}

main().then(() => process.exit(0));

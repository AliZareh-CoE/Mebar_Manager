import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";
import { ac, managerRole, engineerRole } from "@/lib/permissions";

export const ROLES = ["MANAGER", "ENGINEER"] as const;
export type Role = (typeof ROLES)[number];

if (
  process.env.NODE_ENV === "production" &&
  !process.env.BETTER_AUTH_SECRET &&
  // `next build` also runs with NODE_ENV=production; only refuse to *serve*.
  process.env.NEXT_PHASE !== "phase-production-build"
) {
  // Refuse to sign production sessions with a key that lives in the repo.
  throw new Error(
    "BETTER_AUTH_SECRET must be set in production (generate one: openssl rand -base64 32)."
  );
}

export const auth = betterAuth({
  // Fallback keeps local dev zero-config; production refuses to start without
  // a real secret (see check above).
  secret: process.env.BETTER_AUTH_SECRET ?? "mebar-dev-secret-change-in-production",
  database: drizzleAdapter(db, { provider: "sqlite" }),
  emailAndPassword: {
    enabled: true,
    // No self-signup: accounts are created by a manager via the admin plugin.
    disableSignUp: true,
  },
  plugins: [
    admin({
      ac,
      roles: { MANAGER: managerRole, ENGINEER: engineerRole },
      adminRoles: ["MANAGER"],
      defaultRole: "ENGINEER",
    }),
    nextCookies(),
  ],
});

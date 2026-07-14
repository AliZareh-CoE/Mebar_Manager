import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";
import { ac, managerRole, engineerRole } from "@/lib/permissions";

export const ROLES = ["MANAGER", "ENGINEER"] as const;
export type Role = (typeof ROLES)[number];

export const auth = betterAuth({
  // Fallback keeps local dev zero-config; set a real secret in production.
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

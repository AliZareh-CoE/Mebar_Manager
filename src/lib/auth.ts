import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";
import { ac, managerRole, engineerRole, secretaryRole } from "@/lib/permissions";
import { smtpConfigured, sendPasswordResetEmail } from "@/lib/email";

// SECRETARY is lab staff who receive tasks: they see only their own task
// list (no projects/board/compute) while managers see everything.
export const ROLES = ["MANAGER", "ENGINEER", "SECRETARY"] as const;
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
  rateLimit: {
    // Production default is 3 sign-ins per 10s PER IP — a whole lab behind
    // one campus NAT would trip it on a busy morning. Keep brute-force
    // protection, but sized for shared-IP reality.
    customRules: {
      "/sign-in/email": { window: 10, max: 15 },
    },
  },
  emailAndPassword: {
    enabled: true,
    // No self-signup: accounts are created by a manager via the admin plugin.
    disableSignUp: true,
    // Email reset links activate only when SMTP is configured; otherwise the
    // /forgot-password page tells people to ask a coordinator.
    ...(smtpConfigured
      ? {
          sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
            await sendPasswordResetEmail(user.email, url);
          },
        }
      : {}),
  },
  plugins: [
    admin({
      ac,
      roles: { MANAGER: managerRole, ENGINEER: engineerRole, SECRETARY: secretaryRole },
      adminRoles: ["MANAGER"],
      defaultRole: "ENGINEER",
    }),
    nextCookies(),
  ],
});

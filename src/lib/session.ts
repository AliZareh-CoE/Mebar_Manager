import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth, type Role } from "@/lib/auth";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  isDataAnalyst: boolean;
  isComputeCoordinator: boolean;
  digestOptOut: boolean;
  onboardedAt: Date | null;
};

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  if (session.user.banned) return null;

  // The domain flags are hand-added columns better-auth doesn't know about,
  // so session.user never carries them — read the row directly.
  const row = await db
    .select({
      isDataAnalyst: user.isDataAnalyst,
      isComputeCoordinator: user.isComputeCoordinator,
      digestOptOut: user.digestOptOut,
      onboardedAt: user.onboardedAt,
    })
    .from(user)
    .where(eq(user.id, session.user.id))
    .get();

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: (session.user.role as Role) ?? "ENGINEER",
    isDataAnalyst: row?.isDataAnalyst ?? false,
    isComputeCoordinator: row?.isComputeCoordinator ?? false,
    digestOptOut: row?.digestOptOut ?? false,
    onboardedAt: row?.onboardedAt ?? null,
  };
});

/** Auth guard for server actions and pages. Throws if not signed in. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  return user;
}

/** Auth guard for manager-rank-and-above mutations (ADMIN included). */
export async function requireManager(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "MANAGER" && user.role !== "ADMIN") throw new Error("Managers only");
  return user;
}

/** Auth guard for the dangerous stuff — settings, users, feedback triage. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Admin only");
  return user;
}

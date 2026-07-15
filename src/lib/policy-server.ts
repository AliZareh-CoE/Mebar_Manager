import "server-only";
import { getSettings } from "@/lib/settings";
import { can, type Capability, type PolicyCtx } from "@/lib/policy";
import type { SessionUser } from "@/lib/session";
import type { TransitionGateFn } from "@/lib/workflow";

export type Policy = {
  can: (capability: Capability, ctx?: PolicyCtx) => boolean;
};

/** The policy bound to the admin-configured permission matrix. */
export async function getPolicy(user: SessionUser): Promise<Policy> {
  const settings = await getSettings();
  return {
    can: (capability, ctx) => can(user, capability, settings.permissions, ctx),
  };
}

/**
 * Workflow gate from policy. "everyone" is bounded by project visibility
 * (checked by the caller), not by role; the capability gates keep honoring
 * the admin's permission-matrix overrides.
 */
export function transitionGate(user: SessionUser, policy: Policy): TransitionGateFn {
  return (t) => {
    switch (t.gate) {
      case "everyone":
        return true;
      case "manager":
        return user.role === "MANAGER";
      case "project.approve":
        return policy.can("project.approve");
      case "project.kill":
        return policy.can("project.kill");
    }
  };
}

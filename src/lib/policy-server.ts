import "server-only";
import { getSettings } from "@/lib/settings";
import { can, type Capability, type PolicyCtx } from "@/lib/policy";
import type { SessionUser } from "@/lib/session";
import type { EventGate } from "@/lib/state-machine";

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
 * State-machine gate from policy: APPROVE and KILL map to their
 * capabilities; day-to-day transitions are open to everyone.
 */
export function projectEventGate(policy: Policy, ctx?: PolicyCtx): EventGate {
  return (e) => {
    if (e === "APPROVE") return policy.can("project.approve", ctx);
    if (e === "KILL") return policy.can("project.kill", ctx);
    return true;
  };
}

import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements, adminAc, userAc } from "better-auth/plugins/admin/access";

export const ac = createAccessControl(defaultStatements);

// MANAGER gets the full admin permission set (create users, ban, etc.),
// ENGINEER and SECRETARY get the default user set — domain-level power
// differences live in src/lib/policy.ts, not better-auth.
export const managerRole = ac.newRole({ ...adminAc.statements });
export const engineerRole = ac.newRole({ ...userAc.statements });
export const secretaryRole = ac.newRole({ ...userAc.statements });

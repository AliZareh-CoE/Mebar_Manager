import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements, adminAc, userAc } from "better-auth/plugins/admin/access";

export const ac = createAccessControl(defaultStatements);

// Only ADMIN gets the full admin permission set (create users, ban, etc.).
// MANAGER runs the lab's work but has no user-management power — like
// ENGINEER and SECRETARY they get the default user set. Domain-level power
// differences live in src/lib/policy.ts, not better-auth.
export const adminRole = ac.newRole({ ...adminAc.statements });
export const managerRole = ac.newRole({ ...userAc.statements });
export const engineerRole = ac.newRole({ ...userAc.statements });
export const secretaryRole = ac.newRole({ ...userAc.statements });

import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements, adminAc, userAc } from "better-auth/plugins/admin/access";

export const ac = createAccessControl(defaultStatements);

// MANAGER gets the full admin permission set (create users, ban, etc.),
// ENGINEER gets the default user set.
export const managerRole = ac.newRole({ ...adminAc.statements });
export const engineerRole = ac.newRole({ ...userAc.statements });

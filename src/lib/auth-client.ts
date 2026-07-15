"use client";

import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";
import { ac, managerRole, engineerRole, secretaryRole } from "@/lib/permissions";

export const authClient = createAuthClient({
  plugins: [
    adminClient({
      ac,
      roles: { MANAGER: managerRole, ENGINEER: engineerRole, SECRETARY: secretaryRole },
    }),
  ],
});

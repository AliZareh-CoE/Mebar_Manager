/**
 * Pure recipient resolution for project watcher emails — separated from
 * notify.ts (which is server-only) so it can be unit-tested.
 */
export function resolveRecipients(
  rows: { notify: boolean; email: string | null; userEmail: string | null }[]
): string[] {
  const out = new Set<string>();
  for (const r of rows) {
    if (!r.notify) continue;
    // An external's own email wins; members fall back to their account.
    const email = r.email || r.userEmail;
    if (email) out.add(email.toLowerCase());
  }
  return [...out];
}

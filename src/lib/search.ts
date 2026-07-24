/** Case-insensitive multi-field text match for list-page search bars. */
export function matchesQuery(
  q: string | undefined,
  ...fields: (string | null | undefined)[]
): boolean {
  const needle = (q ?? "").trim().toLowerCase();
  if (!needle) return true;
  return fields.some((f) => (f ?? "").toLowerCase().includes(needle));
}

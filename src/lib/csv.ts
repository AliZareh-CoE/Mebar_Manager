/**
 * Tiny CSV writer — RFC-4180-ish: quote every field, double embedded
 * quotes, CRLF rows, UTF-8 BOM so Excel opens it with proper encoding.
 */
export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const cell = (v: string | number | null) =>
    `"${String(v ?? "").replaceAll('"', '""')}"`;
  const lines = [headers.map(cell).join(","), ...rows.map((r) => r.map(cell).join(","))];
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

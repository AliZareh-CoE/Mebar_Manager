/**
 * Minimal iCalendar (RFC 5545) generation for the personal deadline feed.
 * All-day events only — deadlines are dates, not times. Pure, unit-tested.
 */

export type IcsEvent = {
  /** Stable per-entity id — calendar apps dedupe/update on it. */
  uid: string;
  date: Date;
  summary: string;
};

export function escapeIcsText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function icsDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export function buildIcs(name: string, events: IcsEvent[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Mebar Manager//deadlines//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeIcsText(name)}`,
  ];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeIcsText(e.uid)}@mebarmanager`,
      `DTSTART;VALUE=DATE:${icsDate(e.date)}`,
      `SUMMARY:${escapeIcsText(e.summary)}`,
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  // RFC 5545 wants CRLF line endings.
  return lines.join("\r\n") + "\r\n";
}

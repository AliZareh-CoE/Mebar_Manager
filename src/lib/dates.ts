export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;

export function daysBetween(earlier: Date, later: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / DAY_MS);
}

export function daysAgo(n: number, from: Date = new Date()): Date {
  return new Date(from.getTime() - n * DAY_MS);
}

export function daysAhead(n: number, from: Date = new Date()): Date {
  return new Date(from.getTime() + n * DAY_MS);
}

export function hoursBetween(earlier: Date, later: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / HOUR_MS);
}

export function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(d: Date): string {
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

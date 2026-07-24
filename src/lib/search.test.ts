import { describe, expect, it } from "vitest";
import { matchesQuery } from "./search";

describe("matchesQuery", () => {
  it("empty or whitespace query matches everything", () => {
    expect(matchesQuery(undefined, "anything")).toBe(true);
    expect(matchesQuery("  ", "anything")).toBe(true);
  });
  it("case-insensitive substring across fields, null-safe", () => {
    expect(matchesQuery("cryo", "Cryo-stage vibration isolation", null)).toBe(true);
    expect(matchesQuery("KIM", null, "Sara Kim")).toBe(true);
    expect(matchesQuery("ghost", "Cryo-stage", "Sara Kim", undefined)).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { resolveRecipients } from "./notify-recipients";

describe("resolveRecipients", () => {
  it("only notify-enabled rows with a resolvable email get mail", () => {
    expect(
      resolveRecipients([
        { notify: true, email: "maya@ext.edu", userEmail: null }, // external, opted in
        { notify: false, email: "quiet@ext.edu", userEmail: null }, // opted out
        { notify: true, email: null, userEmail: "sara@lab.local" }, // member fallback
        { notify: true, email: null, userEmail: null }, // no email at all
      ])
    ).toEqual(["maya@ext.edu", "sara@lab.local"]);
  });

  it("an external's own email wins over any member fallback", () => {
    expect(
      resolveRecipients([{ notify: true, email: "own@ext.edu", userEmail: "acct@lab.local" }])
    ).toEqual(["own@ext.edu"]);
  });

  it("dedupes case-insensitively", () => {
    expect(
      resolveRecipients([
        { notify: true, email: "Maya@Ext.edu", userEmail: null },
        { notify: true, email: "maya@ext.edu", userEmail: null },
      ])
    ).toEqual(["maya@ext.edu"]);
  });

  it("empty lineup → nobody", () => {
    expect(resolveRecipients([])).toEqual([]);
  });
});

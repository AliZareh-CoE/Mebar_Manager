import { describe, expect, it } from "vitest";
import { collectProposalAnswers, proposalFieldName } from "./proposal";
import { DEFAULT_PROPOSAL_QUESTIONS } from "./settings-defaults";

const CUSTOM = { key: "ETHICS", label: "Ethics story?", builtin: false, archived: false };

function form(entries: Record<string, string>) {
  return { get: (name: string) => entries[name] ?? null };
}

describe("proposalFieldName", () => {
  it("builtins use their column name; customs are prefixed", () => {
    expect(proposalFieldName({ key: "objective", builtin: true })).toBe("objective");
    expect(proposalFieldName(CUSTOM)).toBe("q_ETHICS");
  });
});

describe("collectProposalAnswers", () => {
  const questions = [...DEFAULT_PROPOSAL_QUESTIONS, CUSTOM];

  it("routes builtins to columns and customs to extraAnswers", () => {
    const { columns, extraAnswers } = collectProposalAnswers(
      questions,
      form({ objective: " build a laser ", q_ETHICS: "IRB approved" })
    );
    expect(columns.objective).toBe("build a laser");
    expect(extraAnswers.ETHICS).toBe("IRB approved");
    expect(columns).not.toHaveProperty("q_ETHICS");
  });

  it("absent fields leave existing answers untouched", () => {
    const { columns, extraAnswers } = collectProposalAnswers(
      questions,
      form({ objective: "new answer" }),
      { ETHICS: "kept" }
    );
    expect(columns).toEqual({ objective: "new answer" });
    expect(extraAnswers.ETHICS).toBe("kept");
  });

  it("archived questions are never written, even if the form sends them", () => {
    const archived = questions.map((q) =>
      q.key === "ETHICS" ? { ...q, archived: true } : q
    );
    const { extraAnswers } = collectProposalAnswers(
      archived,
      form({ q_ETHICS: "sneaky write" }),
      { ETHICS: "original" }
    );
    expect(extraAnswers.ETHICS).toBe("original");
  });

  it("a custom key can never collide with a column (q_ prefix)", () => {
    const evil = { key: "objective", label: "Fake", builtin: false, archived: false };
    const { columns, extraAnswers } = collectProposalAnswers(
      [evil],
      form({ q_objective: "not a column write", objective: "ignored" })
    );
    expect(columns).toEqual({});
    expect(extraAnswers.objective).toBe("not a column write");
  });
});

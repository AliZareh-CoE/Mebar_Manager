import { describe, expect, it } from "vitest";
import { buildComputeRequestSchema, submitComputeRequestSchema } from "./compute";
import { DEFAULT_PRACTICES, DEFAULT_SERVER_TYPES } from "@/lib/settings-defaults";

const valid = {
  serverType: "SINGLE_GPU",
  hoursNeeded: "48",
  justification: "Sweep LR/WD grid, ablate augmentations; metrics: precision on held-out batch.",
  datasetSize: "40k images, 18 GB",
  preprocessingNote: "All images resized/normalized; manifest checksummed.",
  dryRunEvidence: "Ran full pipeline on 1k subset, 2 epochs, loss converges.",
  expectedResults: ">95% precision on the held-out batch.",
  optimizations: ["AMP", "CHECKPOINTING"],
};

describe("submitComputeRequestSchema", () => {
  it("accepts a complete single-GPU request", () => {
    expect(submitComputeRequestSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects zero/negative/fractional hours", () => {
    for (const hoursNeeded of ["0", "-4", "2.5"]) {
      expect(submitComputeRequestSchema.safeParse({ ...valid, hoursNeeded }).success).toBe(false);
    }
  });

  it("requires every justification field", () => {
    for (const field of [
      "justification",
      "datasetSize",
      "preprocessingNote",
      "dryRunEvidence",
      "expectedResults",
    ] as const) {
      const result = submitComputeRequestSchema.safeParse({ ...valid, [field]: "  " });
      expect(result.success).toBe(false);
    }
  });

  it("MULTI_GPU without DDP/FSDP is rejected; with it, accepted", () => {
    const without = submitComputeRequestSchema.safeParse({
      ...valid,
      serverType: "MULTI_GPU",
    });
    expect(without.success).toBe(false);
    expect(without.success ? "" : without.error.issues[0].message).toContain("Distributed training");

    const withDdp = submitComputeRequestSchema.safeParse({
      ...valid,
      serverType: "MULTI_GPU",
      optimizations: ["DDP_FSDP", "AMP"],
    });
    expect(withDdp.success).toBe(true);
  });

  it("CPU and SINGLE_GPU don't require DDP/FSDP", () => {
    for (const serverType of ["CPU", "SINGLE_GPU"]) {
      expect(
        submitComputeRequestSchema.safeParse({ ...valid, serverType, optimizations: [] }).success
      ).toBe(true);
    }
  });

  it("rejects unknown optimization keys", () => {
    expect(
      submitComputeRequestSchema.safeParse({ ...valid, optimizations: ["QUANTUM_SPEEDUP"] }).success
    ).toBe(false);
  });
});

describe("buildComputeRequestSchema (admin-defined taxonomies)", () => {
  it("admin-added server types with custom mandatory practices are enforced", () => {
    const schema = buildComputeRequestSchema({
      serverTypes: [
        ...DEFAULT_SERVER_TYPES,
        {
          key: "TPU_POD",
          label: "TPU pod",
          archived: false,
          mandatoryPractices: ["CHECKPOINTING", "AMP"],
        },
      ],
      practices: DEFAULT_PRACTICES,
    });
    const missing = schema.safeParse({ ...valid, serverType: "TPU_POD", optimizations: ["AMP"] });
    expect(missing.success).toBe(false);
    expect(missing.success ? "" : missing.error.issues[0].message).toContain("Resumable jobs");
    expect(
      schema.safeParse({
        ...valid,
        serverType: "TPU_POD",
        optimizations: ["CHECKPOINTING", "AMP"],
      }).success
    ).toBe(true);
  });

  it("archived server types and practices are not selectable for new requests", () => {
    const schema = buildComputeRequestSchema({
      serverTypes: DEFAULT_SERVER_TYPES.map((s) =>
        s.key === "CPU" ? { ...s, archived: true } : s
      ),
      practices: DEFAULT_PRACTICES.map((p) =>
        p.key === "CUPY" ? { ...p, archived: true } : p
      ),
    });
    expect(schema.safeParse({ ...valid, serverType: "CPU" }).success).toBe(false);
    expect(schema.safeParse({ ...valid, optimizations: ["CUPY"] }).success).toBe(false);
  });

  it("editing keeps a row's now-archived values valid", () => {
    const schema = buildComputeRequestSchema({
      serverTypes: DEFAULT_SERVER_TYPES.map((s) =>
        s.key === "CPU" ? { ...s, archived: true } : s
      ),
      practices: DEFAULT_PRACTICES.map((p) =>
        p.key === "CUPY" ? { ...p, archived: true } : p
      ),
      current: { serverType: "CPU", optimizations: ["CUPY"] },
    });
    expect(
      schema.safeParse({ ...valid, serverType: "CPU", optimizations: ["CUPY"] }).success
    ).toBe(true);
  });

  it("mandatory keys pointing at removed practices are ignored, not fatal", () => {
    const schema = buildComputeRequestSchema({
      serverTypes: [
        {
          key: "MULTI_GPU",
          label: "Multi-GPU",
          archived: false,
          mandatoryPractices: ["GHOST_PRACTICE"],
        },
      ],
      practices: DEFAULT_PRACTICES,
    });
    expect(
      schema.safeParse({ ...valid, serverType: "MULTI_GPU", optimizations: [] }).success
    ).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { submitComputeRequestSchema } from "./compute";

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
    expect(without.success ? "" : without.error.issues[0].message).toContain("DDP/FSDP");

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

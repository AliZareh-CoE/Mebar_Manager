import { z } from "zod";
import { SERVER_TYPES, OPTIMIZATION_KEYS } from "@/lib/db/schema";

/**
 * The compute-request gauntlet. Every field is required — a request that
 * can't answer these isn't ready to burn GPU hours. Lives outside the
 * "use server" action file so unit tests (and the form) can import it.
 */
export const submitComputeRequestSchema = z
  .object({
    serverType: z.enum(SERVER_TYPES),
    hoursNeeded: z.coerce
      .number({ error: "How many hours?" })
      .int("Whole hours only")
      .positive("Hours must be a positive number"),
    justification: z
      .string()
      .trim()
      .min(1, "Justify it: sweeps/ablations, training strategy and schedule, metrics and success criteria"),
    datasetSize: z
      .string()
      .trim()
      .min(1, 'Exact dataset size is required (e.g. "40k images, 18 GB")'),
    preprocessingNote: z
      .string()
      .trim()
      .min(1, "Prove the data is fully preprocessed — no cleaning on the clock"),
    dryRunEvidence: z
      .string()
      .trim()
      .min(1, "Show your dry run on a small subset before asking for full-scale hours"),
    expectedResults: z
      .string()
      .trim()
      .min(1, "What outcomes do you anticipate? You'll compare against this afterwards"),
    optimizations: z.array(z.enum(OPTIMIZATION_KEYS)),
  })
  .refine(
    (d) => d.serverType !== "MULTI_GPU" || d.optimizations.includes("DDP_FSDP"),
    {
      message:
        "Multi-GPU requests must commit to distributed training (DDP/FSDP) — otherwise request a single GPU",
      path: ["optimizations"],
    }
  );

export type SubmitComputeRequestInput = z.infer<typeof submitComputeRequestSchema>;

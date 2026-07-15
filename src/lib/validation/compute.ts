import { z } from "zod";
import {
  DEFAULT_PRACTICES,
  DEFAULT_SERVER_TYPES,
  type ServerTypeItem,
  type TaxonomyItem,
} from "@/lib/settings-defaults";

/**
 * The compute-request gauntlet. Every field is required — a request that
 * can't answer these isn't ready to burn GPU hours.
 *
 * Server types and practices are admin-defined, so the schema is built
 * per-request from settings. Each server type carries `mandatoryPractices`
 * the requester must commit to (stock: MULTI_GPU ⇒ DDP/FSDP). When editing,
 * pass `current` so a row keeps its (possibly archived) values.
 */
export function buildComputeRequestSchema(opts: {
  serverTypes: ServerTypeItem[];
  practices: TaxonomyItem[];
  current?: { serverType: string; optimizations: string[] };
}) {
  const selectableTypes = new Set(
    opts.serverTypes.filter((s) => !s.archived).map((s) => s.key)
  );
  if (opts.current) selectableTypes.add(opts.current.serverType);

  const selectablePractices = new Set(
    opts.practices.filter((p) => !p.archived).map((p) => p.key)
  );
  for (const key of opts.current?.optimizations ?? []) selectablePractices.add(key);

  const practiceLabel = (key: string) =>
    opts.practices.find((p) => p.key === key)?.label.split(" — ")[0] ?? key;

  return z
    .object({
      serverType: z
        .string()
        .refine((v) => selectableTypes.has(v), "Pick a server type"),
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
      optimizations: z.array(
        z.string().refine((v) => selectablePractices.has(v), "Unknown optimization practice")
      ),
    })
    .superRefine((d, ctx) => {
      const serverType = opts.serverTypes.find((s) => s.key === d.serverType);
      // Ignore mandatory keys pointing at practices an admin later removed.
      const missing = (serverType?.mandatoryPractices ?? []).filter(
        (p) => selectablePractices.has(p) && !d.optimizations.includes(p)
      );
      if (missing.length > 0) {
        ctx.addIssue({
          code: "custom",
          path: ["optimizations"],
          message: `${serverType!.label} requests must commit to: ${missing
            .map(practiceLabel)
            .join(", ")}`,
        });
      }
    });
}

/** Stock-config schema — default behavior and unit tests. */
export const submitComputeRequestSchema = buildComputeRequestSchema({
  serverTypes: DEFAULT_SERVER_TYPES,
  practices: DEFAULT_PRACTICES,
});

export type SubmitComputeRequestInput = z.infer<typeof submitComputeRequestSchema>;

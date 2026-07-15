import type { ComputeRequestStatus } from "@/lib/db/schema";

/**
 * Labels for FIXED lifecycle statuses. Everything taxonomy-like (cause tags,
 * server types, optimization practices) is admin-editable and lives in lab
 * settings — resolve those labels from getSettings(), not here.
 */
export const COMPUTE_STATUS_LABELS: Record<ComputeRequestStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  DENIED: "Denied",
  COMPLETED: "Completed",
  WITHDRAWN: "Withdrawn",
};

import type {
  CauseTag,
  OptimizationKey,
  ServerType,
  ComputeRequestStatus,
} from "@/lib/db/schema";

export const CAUSE_TAG_LABELS: Record<CauseTag, string> = {
  WAITING_DECISION: "Waiting on a decision",
  WAITING_EQUIPMENT: "Waiting on equipment",
  TECHNICAL: "Technical problem",
  WAITING_EXTERNAL: "Waiting on external party",
  KNOWLEDGE_GAP: "Knowledge gap",
  OTHER: "Other",
};

export const SERVER_TYPE_LABELS: Record<ServerType, string> = {
  CPU: "CPU",
  SINGLE_GPU: "Single GPU",
  MULTI_GPU: "Multi-GPU",
};

export const COMPUTE_STATUS_LABELS: Record<ComputeRequestStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  DENIED: "Denied",
  COMPLETED: "Completed",
};

/** The optimization practices a requester commits to. */
export const OPTIMIZATION_PRACTICES: Record<OptimizationKey, string> = {
  VECTORIZED_OPS: "Vectorized operations (no per-sample Python loops)",
  CACHING: "Caching to avoid redundant computation",
  CHECKPOINTING: "Resumable jobs with checkpoint saving",
  CUPY: "CuPy for GPU-accelerated array work",
  AMP: "Mixed-precision training (AMP)",
  DALI: "NVIDIA DALI data-loading pipelines",
  DDP_FSDP: "Distributed training (DDP / FSDP) — mandatory on multi-GPU",
  GRAD_ACCUM: "Gradient accumulation for larger effective batches",
  TENSORRT: "TensorRT-optimized inference",
};

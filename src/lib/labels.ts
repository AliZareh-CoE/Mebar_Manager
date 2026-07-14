import type { CauseTag } from "@/lib/db/schema";

export const CAUSE_TAG_LABELS: Record<CauseTag, string> = {
  WAITING_DECISION: "Waiting on a decision",
  WAITING_EQUIPMENT: "Waiting on equipment",
  TECHNICAL: "Technical problem",
  WAITING_EXTERNAL: "Waiting on external party",
  KNOWLEDGE_GAP: "Knowledge gap",
  OTHER: "Other",
};

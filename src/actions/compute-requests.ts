"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { computeRequests, projects } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import { getPolicy } from "@/lib/policy-server";
import { submitComputeRequestSchema } from "@/lib/validation/compute";
import type { ActionResult } from "@/lib/action-utils";

function revalidateComputeRequest(projectId: string) {
  revalidatePath("/");
  revalidatePath("/compute");
  revalidatePath(`/projects/${projectId}`);
}

export async function submitComputeRequest(
  projectId: string,
  formData: FormData
): Promise<ActionResult> {
  const me = await requireUser();

  const project = await db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) return { error: "Project not found." };

  // parseForm would keep only the LAST checkbox value — collect them all.
  const raw = {
    ...Object.fromEntries(formData.entries()),
    optimizations: formData.getAll("optimizations").map(String),
  };
  const parsed = submitComputeRequestSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue.message };
  }

  await db.insert(computeRequests).values({
    projectId,
    requesterId: me.id,
    ...parsed.data,
  });

  revalidateComputeRequest(projectId);
  return {};
}

const approveSchema = z.object({
  accessInstructions: z
    .string()
    .trim()
    .min(1, "How do they get on the machine? NVIDIA Brev link, credentials note…"),
  windowEnd: z.coerce.date({ error: "When do the allocated hours expire?" }),
});

export async function approveComputeRequest(
  requestId: string,
  formData: FormData
): Promise<ActionResult> {
  const me = await requireUser();
  const policy = await getPolicy(me);
  // STRICT: only THE compute coordinator decides — no manager fallback.
  if (!policy.can("compute.decide")) {
    return { error: "Only the compute coordinator can approve requests." };
  }

  const parsed = approveSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (parsed.data.windowEnd.getTime() <= Date.now()) {
    return { error: "The usage window must end in the future." };
  }

  const request = await db
    .select()
    .from(computeRequests)
    .where(eq(computeRequests.id, requestId))
    .get();
  if (!request) return { error: "Request not found." };
  if (request.status !== "PENDING") return { error: "This request is already decided." };

  await db
    .update(computeRequests)
    .set({
      status: "APPROVED",
      accessInstructions: parsed.data.accessInstructions,
      windowEnd: parsed.data.windowEnd,
      decidedById: me.id,
      decidedAt: new Date(),
    })
    .where(eq(computeRequests.id, requestId));

  revalidateComputeRequest(request.projectId);
  return {};
}

export async function denyComputeRequest(
  requestId: string,
  formData: FormData
): Promise<ActionResult> {
  const me = await requireUser();
  const policy = await getPolicy(me);
  if (!policy.can("compute.decide")) {
    return { error: "Only the compute coordinator can deny requests." };
  }

  const denialReason = String(formData.get("denialReason") ?? "").trim();
  if (!denialReason) return { error: "Denials need a reason — that's how requests improve." };

  const request = await db
    .select()
    .from(computeRequests)
    .where(eq(computeRequests.id, requestId))
    .get();
  if (!request) return { error: "Request not found." };
  if (request.status !== "PENDING") return { error: "This request is already decided." };

  await db
    .update(computeRequests)
    .set({
      status: "DENIED",
      denialReason,
      decidedById: me.id,
      decidedAt: new Date(),
    })
    .where(eq(computeRequests.id, requestId));

  revalidateComputeRequest(request.projectId);
  return {};
}

export async function submitComputeResults(
  requestId: string,
  formData: FormData
): Promise<ActionResult> {
  const me = await requireUser();

  const resultsSummary = String(formData.get("resultsSummary") ?? "").trim();
  if (!resultsSummary) {
    return { error: "Summarize the final outcomes vs. what you expected." };
  }

  const request = await db
    .select()
    .from(computeRequests)
    .where(eq(computeRequests.id, requestId))
    .get();
  if (!request) return { error: "Request not found." };
  if (request.status !== "APPROVED") {
    return { error: "Results are submitted on approved requests." };
  }
  if (me.id !== request.requesterId && me.role !== "MANAGER") {
    return { error: "Only the requester (or a manager) can submit results." };
  }

  await db
    .update(computeRequests)
    .set({ status: "COMPLETED", resultsSummary, completedAt: new Date() })
    .where(eq(computeRequests.id, requestId));

  revalidateComputeRequest(request.projectId);
  return {};
}

export async function updateComputeRequest(
  requestId: string,
  formData: FormData
): Promise<ActionResult> {
  const me = await requireUser();

  const request = await db
    .select()
    .from(computeRequests)
    .where(eq(computeRequests.id, requestId))
    .get();
  if (!request) return { error: "Request not found." };
  if (request.status !== "PENDING") return { error: "Only pending requests can be edited." };

  const policy = await getPolicy(me);
  if (!policy.can("computeRequest.withdraw", { involvedUserIds: [request.requesterId] })) {
    return { error: "Only the requester (or a manager) can edit this request." };
  }

  const raw = {
    ...Object.fromEntries(formData.entries()),
    optimizations: formData.getAll("optimizations").map(String),
  };
  const parsed = submitComputeRequestSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await db.update(computeRequests).set(parsed.data).where(eq(computeRequests.id, requestId));
  revalidateComputeRequest(request.projectId);
  return {};
}

export async function withdrawComputeRequest(
  requestId: string,
  _formData?: FormData
): Promise<ActionResult> {
  void _formData;
  const me = await requireUser();

  const request = await db
    .select()
    .from(computeRequests)
    .where(eq(computeRequests.id, requestId))
    .get();
  if (!request) return { error: "Request not found." };
  if (request.status !== "PENDING") return { error: "Only pending requests can be withdrawn." };

  const policy = await getPolicy(me);
  if (!policy.can("computeRequest.withdraw", { involvedUserIds: [request.requesterId] })) {
    return { error: "Only the requester (or a manager) can withdraw this request." };
  }

  await db
    .update(computeRequests)
    .set({ status: "WITHDRAWN" })
    .where(eq(computeRequests.id, requestId));

  revalidateComputeRequest(request.projectId);
  return {};
}

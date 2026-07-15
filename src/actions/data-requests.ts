"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { dataRequests, user } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import { getPolicy } from "@/lib/policy-server";
import { parseForm, type ActionResult } from "@/lib/action-utils";

function revalidateDataRequest(projectId: string) {
  revalidatePath("/");
  revalidatePath("/data");
  revalidatePath(`/projects/${projectId}`);
}

async function verifyAnalyst(userId: string): Promise<string | null> {
  const target = await db.select().from(user).where(eq(user.id, userId)).get();
  if (!target || target.banned) return "That account is not available.";
  if (!target.isDataAnalyst) return "That person is not a data analyst.";
  return null;
}

const fileDataRequestSchema = z.object({
  title: z.string().trim().min(1, "What data do you need?"),
  description: z
    .string()
    .trim()
    .min(1, "Describe format, source, and granularity — save the analyst a round-trip"),
  neededBy: z.coerce.date({ error: "A needed-by date is required — data requests without dates rot" }),
  assigneeId: z.string().optional(),
});

export async function fileDataRequest(
  projectId: string,
  formData: FormData
): Promise<ActionResult> {
  const me = await requireUser();

  const parsed = parseForm(fileDataRequestSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  const assigneeId = parsed.data.assigneeId || null;
  if (assigneeId) {
    const problem = await verifyAnalyst(assigneeId);
    if (problem) return { error: problem };
  }

  await db.insert(dataRequests).values({
    projectId,
    title: parsed.data.title,
    description: parsed.data.description,
    neededBy: parsed.data.neededBy,
    requesterId: me.id,
    assigneeId,
  });

  revalidateDataRequest(projectId);
  return {};
}

export async function assignDataRequest(
  requestId: string,
  assigneeId: string
): Promise<ActionResult> {
  const me = await requireUser();

  const request = await db
    .select()
    .from(dataRequests)
    .where(eq(dataRequests.id, requestId))
    .get();
  if (!request) return { error: "Data request not found." };
  if (request.status !== "OPEN") return { error: "Already delivered." };

  const policy = await getPolicy(me);
  const selfClaim = me.isDataAnalyst && assigneeId === me.id;
  if (
    !selfClaim &&
    !policy.can("dataRequest.edit", { involvedUserIds: [request.requesterId, request.assigneeId] })
  ) {
    return { error: "Only the requester, a manager, or a self-claiming analyst can assign this." };
  }

  const problem = await verifyAnalyst(assigneeId);
  if (problem) return { error: problem };

  await db
    .update(dataRequests)
    .set({ assigneeId })
    .where(eq(dataRequests.id, requestId));

  revalidateDataRequest(request.projectId);
  return {};
}

export async function deliverDataRequest(
  requestId: string,
  formData: FormData
): Promise<ActionResult> {
  const me = await requireUser();

  const deliveryNote = String(formData.get("deliveryNote") ?? "").trim();
  const request = await db
    .select()
    .from(dataRequests)
    .where(eq(dataRequests.id, requestId))
    .get();
  if (!request) return { error: "Data request not found." };
  if (request.status !== "OPEN") return { error: "Already delivered." };
  const policy = await getPolicy(me);
  if (!policy.can("dataRequest.deliver", { involvedUserIds: [request.assigneeId] })) {
    return { error: "Only the assigned analyst (or a manager) can deliver this." };
  }
  if (!deliveryNote) {
    return { error: "Say where the data lives and how it was collected — that's the deliverable." };
  }

  await db
    .update(dataRequests)
    .set({ status: "DELIVERED", deliveryNote, deliveredAt: new Date() })
    .where(eq(dataRequests.id, requestId));

  revalidateDataRequest(request.projectId);
  return {};
}

export async function editDataRequest(
  requestId: string,
  formData: FormData
): Promise<ActionResult> {
  const me = await requireUser();

  const parsed = parseForm(fileDataRequestSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  const request = await db
    .select()
    .from(dataRequests)
    .where(eq(dataRequests.id, requestId))
    .get();
  if (!request) return { error: "Data request not found." };
  if (request.status !== "OPEN") return { error: "This request is closed." };

  const policy = await getPolicy(me);
  if (
    !policy.can("dataRequest.edit", {
      involvedUserIds: [request.requesterId, request.assigneeId],
    })
  ) {
    return { error: "You don't have permission to edit this request." };
  }

  const assigneeId = parsed.data.assigneeId || null;
  if (assigneeId && assigneeId !== request.assigneeId) {
    const problem = await verifyAnalyst(assigneeId);
    if (problem) return { error: problem };
  }

  await db
    .update(dataRequests)
    .set({
      title: parsed.data.title,
      description: parsed.data.description,
      neededBy: parsed.data.neededBy,
      assigneeId,
    })
    .where(eq(dataRequests.id, requestId));

  revalidateDataRequest(request.projectId);
  return {};
}

export async function cancelDataRequest(
  requestId: string,
  formData: FormData
): Promise<ActionResult> {
  const me = await requireUser();

  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Say why the data is no longer needed." };

  const request = await db
    .select()
    .from(dataRequests)
    .where(eq(dataRequests.id, requestId))
    .get();
  if (!request) return { error: "Data request not found." };
  if (request.status !== "OPEN") return { error: "This request is already closed." };

  const policy = await getPolicy(me);
  if (
    !policy.can("dataRequest.cancel", {
      involvedUserIds: [request.requesterId, request.assigneeId],
    })
  ) {
    return { error: "You don't have permission to cancel this request." };
  }

  await db
    .update(dataRequests)
    .set({ status: "CANCELLED", deliveryNote: reason, deliveredAt: new Date() })
    .where(eq(dataRequests.id, requestId));

  revalidateDataRequest(request.projectId);
  return {};
}

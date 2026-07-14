import type { z } from "zod";

export type ActionResult = { error?: string };

/** Parse FormData against a zod schema, flattening the first error message. */
export function parseForm<T extends z.ZodType>(
  schema: T,
  formData: FormData
): { success: true; data: z.infer<T> } | { success: false; error: string } {
  const result = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue.path.join(".");
    return { success: false, error: field ? `${field}: ${issue.message}` : issue.message };
  }
  return { success: true, data: result.data };
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth";

/**
 * Route-handler conventions (spec §8): Zod-validate input, scope every query
 * by the session's userId, return typed JSON errors.
 */

export type ApiError = { error: { code: string; message: string; issues?: unknown } };

export function jsonError(status: number, code: string, message: string, issues?: unknown) {
  return NextResponse.json<ApiError>(
    { error: { code, message, ...(issues !== undefined ? { issues } : {}) } },
    { status },
  );
}

export const unauthorized = () => jsonError(401, "unauthorized", "Sign in required");
export const notFound = () => jsonError(404, "not_found", "Not found");

/** Returns the signed-in userId or a ready-to-return 401 response. */
export async function requireUserId(): Promise<{ userId: string } | { response: NextResponse }> {
  const userId = await getUserId();
  if (!userId) return { response: unauthorized() };
  return { userId };
}

/** Parse a JSON body against a Zod schema; failure yields a typed 400. */
export async function parseBody<T extends z.ZodType>(
  req: Request,
  schema: T,
): Promise<{ data: z.output<T> } | { response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { response: jsonError(400, "invalid_json", "Body must be valid JSON") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      response: jsonError(400, "validation_error", "Invalid request body", parsed.error.issues),
    };
  }
  return { data: parsed.data };
}

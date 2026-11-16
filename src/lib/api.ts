import { NextResponse } from "next/server";
import type { Db } from "mongodb";
import { currentUser, type UserDoc } from "./auth";
import { ensureSetup } from "./data";
import { getDb } from "./mongo";

export const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export const fail = (status: number, error: string, code?: string) => json({ error, code }, status);

/** Database setup and error handling for a request that needs no sign-in (sign-in itself). */
export async function withOpenDb(handler: (db: Db) => Promise<NextResponse>): Promise<NextResponse> {
  try {
    const db = await getDb();
    await ensureSetup(db);
    return await handler(db);
  } catch (err) {
    console.error(err);
    return fail(500, "The database could not be reached. Please try again.");
  }
}

/**
 * Wraps an API handler with the sign-in check. `need` is who may call it. A user who still
 * has to replace a temporary password can do nothing else until they have, unless the
 * handler opts in with `duringPasswordChange`.
 */
export async function withDb(
  need: "user" | "admin",
  handler: (db: Db, user: UserDoc) => Promise<NextResponse>,
  options: { duringPasswordChange?: boolean } = {},
): Promise<NextResponse> {
  return withOpenDb(async (db) => {
    const user = await currentUser(db);
    if (!user) return fail(401, "Sign in to continue");
    if (user.mustChangePassword && !options.duringPasswordChange) {
      return fail(403, "Choose a new password to continue", "password_change");
    }
    if (need === "admin" && user.role !== "admin") return fail(403, "Admin access is required");
    return handler(db, user);
  });
}

/**
 * Changes must come from this site. Browsers send Origin on such requests; one from
 * another site is refused (the session cookie is SameSite as well).
 */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  if (!sameOrigin(req)) return null;
  try {
    const body = await req.json();
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

import { NextResponse } from "next/server";
import type { Db } from "mongodb";
import { getRole } from "./auth";
import { ensureSetup } from "./data";
import { getDb } from "./mongo";
import type { Role } from "./types";

export const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export const fail = (status: number, error: string) => json({ error }, status);

/** Wraps an API handler with the access check, database setup and error handling. */
export async function withDb(
  need: "team" | "admin",
  handler: (db: Db, role: Role) => Promise<NextResponse>,
): Promise<NextResponse> {
  const role = await getRole();
  if (role === "none") return fail(401, "Sign in to continue");
  if (need === "admin" && role !== "admin") return fail(403, "Admin access is required");
  try {
    const db = await getDb();
    await ensureSetup(db);
    return await handler(db, role);
  } catch (err) {
    console.error(err);
    return fail(500, "The database could not be reached. Please try again.");
  }
}

export async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

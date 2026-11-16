import { fail, json, readBody, withDb } from "@/lib/api";
import { createLine, listLines, parseLineFields } from "@/lib/data";
import type { LineFields } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return withDb("team", async (db, role) => json({ role, lines: await listLines(db) }));
}

export async function POST(req: Request) {
  const body = await readBody(req);
  const parsed = parseLineFields(body, false);
  if ("error" in parsed) return fail(400, parsed.error);
  return withDb("admin", async (db) => json(await createLine(db, parsed.fields as LineFields), 201));
}

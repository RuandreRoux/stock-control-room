import { fail, json, readBody, withDb } from "@/lib/api";
import { parseLineFields, updateLine } from "@/lib/data";
import { sastDate } from "@/lib/time";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readBody(req);
  if (!body) return fail(400, "Invalid request");
  const parsed = parseLineFields(body, true);
  if ("error" in parsed) return fail(400, parsed.error);
  const active = typeof body.active === "boolean" ? body.active : undefined;
  return withDb("admin", async (db) => {
    const line = await updateLine(db, id, parsed.fields, active, sastDate());
    return line ? json(line) : fail(404, "Line not found");
  });
}

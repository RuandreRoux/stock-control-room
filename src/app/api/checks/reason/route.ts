import { fail, json, readBody, withDb } from "@/lib/api";
import { setReason } from "@/lib/data";
import { FIRST_SHEET, isValidDate, sastDate } from "@/lib/time";

/** Save the reason for a count mismatch on one line of one sheet. Empty text removes it. */
export async function PUT(req: Request) {
  const body = await readBody(req);
  if (!body) return fail(400, "Invalid request");
  const { date, lineId, text } = body;
  if (!isValidDate(date)) return fail(400, "Invalid date");
  if (typeof lineId !== "string" || !/^[a-f0-9]{24}$/.test(lineId)) return fail(400, "Invalid line");
  if (typeof text !== "string" || text.length > 1000) return fail(400, "The reason is too long");
  return withDb("user", async (db, user) => {
    if (date > sastDate()) return fail(400, "That day has not started yet");
    if (date < FIRST_SHEET) return fail(400, "There are no sheets before 17 Nov 2026");
    const updated = await setReason(db, date, lineId, text.trim(), user.name);
    return updated ? json(updated) : fail(404, "Line not found for this day");
  });
}

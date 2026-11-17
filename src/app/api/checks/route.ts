import { fail, json, readBody, withDb } from "@/lib/api";
import { updateStep, type StepPatch } from "@/lib/data";
import { STEPS } from "@/lib/logic";
import { isValidDate, isWorkingDay, sastDate } from "@/lib/time";
import type { StepKey } from "@/lib/types";

export async function PATCH(req: Request) {
  const body = await readBody(req);
  if (!body) return fail(400, "Invalid request");
  const { date, lineId, step, checked, count, comment } = body;

  if (!isValidDate(date)) return fail(400, "Invalid date");
  if (typeof lineId !== "string" || !/^[a-f0-9]{24}$/.test(lineId)) return fail(400, "Invalid line");
  if (typeof step !== "string" || !STEPS.includes(step as StepKey)) return fail(400, "Invalid check");

  const patch: StepPatch = {};
  if (comment !== undefined) {
    if (typeof comment !== "string" || comment.length > 1000) return fail(400, "Comment is too long");
    patch.comment = comment.trim();
  }
  if (checked !== undefined) {
    if (typeof checked !== "boolean") return fail(400, "Invalid check");
    patch.checked = checked;
    if (checked) {
      const n = count ?? 0;
      if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > 100000) {
        return fail(400, "The count must be a whole number");
      }
      patch.count = n;
    }
  }
  return withDb("user", async (db, user) => {
    const today = sastDate();
    if (date > today) return fail(400, "That day has not started yet");
    if (!isWorkingDay(date)) return fail(400, "There are no checks on weekends or public holidays");
    const updated = await updateStep(db, date, lineId, step as StepKey, patch, user.name);
    if (!updated) return fail(404, "Line not found for this day");
    return json(updated);
  });
}

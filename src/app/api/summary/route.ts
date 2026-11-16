import { fail, json, withDb } from "@/lib/api";
import { getChecksInRange } from "@/lib/data";
import { summarise } from "@/lib/logic";
import { addDays, isValidDate, isWorkingDay, sastDate } from "@/lib/time";
import type { DayCheck } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Exception totals per day for the days leading up to (and including) `to`. */
export async function GET(req: Request) {
  return withDb("user", async (db) => {
    const params = new URL(req.url).searchParams;
    const today = sastDate();
    const to = params.get("to") || today;
    if (!isValidDate(to)) return fail(400, "Invalid date");
    // `days` counts calendar days back from `to`; non-working days are left out of the result.
    const days = Math.min(Math.max(Number(params.get("days")) || 7, 1), 45);
    const from = addDays(to, -(days - 1));

    const byDate = new Map<string, DayCheck[]>();
    for (const check of await getChecksInRange(db, from, to)) {
      if (!isWorkingDay(check.date)) continue;
      const list = byDate.get(check.date);
      if (list) list.push(check);
      else byDate.set(check.date, [check]);
    }
    const now = Date.now();
    const summaries = [...byDate.entries()]
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([date, checks]) => summarise(date, checks, now));
    return json({ from, to, days: summaries });
  });
}

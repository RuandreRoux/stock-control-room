import { fail, json, withDb } from "@/lib/api";
import { getDay } from "@/lib/data";
import { isValidDate, sastDate } from "@/lib/time";
import type { DayResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withDb("user", async (db, user) => {
    const today = sastDate();
    const date = new URL(req.url).searchParams.get("date") || today;
    if (!isValidDate(date)) return fail(400, "Invalid date");
    const checks = await getDay(db, date, today);
    const body: DayResponse = {
      date,
      today,
      role: user.role,
      // Every sheet up to today can be changed by everyone; the page makes it very clear which one it is.
      open: date <= today,
      canEdit: date <= today,
      checks,
    };
    return json(body);
  });
}

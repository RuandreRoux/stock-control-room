import { fail, json, withDb } from "@/lib/api";
import { getDay } from "@/lib/data";
import { isValidDate, sastDate } from "@/lib/time";
import type { DayResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withDb("team", async (db, role) => {
    const today = sastDate();
    const date = new URL(req.url).searchParams.get("date") || today;
    if (!isValidDate(date)) return fail(400, "Invalid date");
    const checks = await getDay(db, date, today);
    const body: DayResponse = {
      date,
      today,
      role,
      // Previous days are a record: only an admin can correct them.
      canEdit: date === today || (date < today && role === "admin"),
      checks,
    };
    return json(body);
  });
}

import { fail, json, readBody, withDb } from "@/lib/api";
import { buildReport } from "@/lib/report";
import { postToTeams } from "@/lib/teams";
import { isValidDate, isWorkingDay, latestWorkingDay, sastDate } from "@/lib/time";

/** Post a report to Teams now (admin): for the sheet due today, or for a sheet the admin chooses. */
export async function POST(req: Request) {
  const body = await readBody(req);
  if (!body) return fail(400, "Invalid request");
  const date = body.date;
  if (date !== undefined && date !== null && date !== "") {
    if (!isValidDate(date)) return fail(400, "Choose a valid date");
    if (date > latestWorkingDay(sastDate())) return fail(400, "That sheet has not started yet");
    if (!isWorkingDay(date)) return fail(400, "There is no sheet on weekends or public holidays");
  }
  return withDb("admin", async (db) => {
    const report = await buildReport(db, "Report on request", undefined, typeof date === "string" && date ? date : undefined);
    if (!report) return fail(400, "There is no sheet due today (weekend or public holiday). Choose a date.");
    const result = await postToTeams(db, report);
    return result.ok ? json({ ok: true }) : fail(502, result.error ?? "The report could not be posted");
  });
}

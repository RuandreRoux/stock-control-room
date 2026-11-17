import { fail, json, sameOrigin, withDb } from "@/lib/api";
import { buildReport } from "@/lib/report";
import { postToTeams } from "@/lib/teams";

/** Post today's report to Teams now (admin), for example to check what it looks like. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "Invalid request");
  return withDb("admin", async (db) => {
    const report = await buildReport(db, "Report on request");
    if (!report) return fail(400, "There is no check sheet today (weekend or public holiday)");
    const result = await postToTeams(db, report);
    return result.ok ? json({ ok: true }) : fail(502, result.error ?? "The report could not be posted");
  });
}

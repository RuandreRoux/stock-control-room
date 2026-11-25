import { timingSafeEqual } from "node:crypto";
import { fail, json, withOpenDb } from "@/lib/api";
import { buildReport, REPORT_SLOTS, type ReportSlot } from "@/lib/report";
import { postToTeams, teamsStatus } from "@/lib/teams";
import { isWorkingDay, sastDate } from "@/lib/time";

export const dynamic = "force-dynamic";

/** Hours after the scheduled time in which the report may still go out (schedulers can run late). */
const WINDOW_HOURS = 2;

function authorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // without a secret, the time window and once-only rule below still apply
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Called by the GitHub Actions schedule shortly after 10:00, 15:00 and 17:00 (SAST) on weekdays. Posts the
 * report to the Teams chat. Each report goes out at most once per day, only on working
 * days, and only within two hours of its time, so calling this address early, late or
 * repeatedly cannot produce extra or misleading reports.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slot: string }> }) {
  if (!authorised(req)) return fail(401, "Not allowed");
  const { slot } = await params;
  if (!(slot in REPORT_SLOTS)) return fail(404, "Unknown report");
  const { hour, title, note } = REPORT_SLOTS[slot as ReportSlot];

  return withOpenDb(async (db) => {
    const today = sastDate();
    if (!isWorkingDay(today)) return json({ sent: false, reason: "Not a working day" });
    const sastHour = new Date(Date.now() + 2 * 60 * 60 * 1000).getUTCHours();
    if (sastHour < hour || sastHour >= hour + WINDOW_HOURS) return json({ sent: false, reason: "Outside the report time" });
    const teams = await teamsStatus(db);
    if (!teams.on || !teams.reports) return json({ sent: false, reason: "Teams reports are off" });

    const marker = db.collection<{ _id: string; at: Date; source: string }>("meta");
    const id = `report:${today}:${slot}`;
    // Who asked, so the Admin page can show when and how each report went out.
    const asked = new URL(req.url).searchParams.get("source");
    const source = asked === "github" ? "GitHub" : asked === "timer" ? "Timer" : "Other";
    try {
      await marker.insertOne({ _id: id, at: new Date(), source });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) return json({ sent: false, reason: "Already sent" });
      throw err;
    }
    const report = await buildReport(db, title, note);
    const result = report ? await postToTeams(db, report) : { ok: false, error: "No report for today" };
    if (!result.ok) {
      await marker.deleteOne({ _id: id }); // let a later run try again
      return fail(502, result.error ?? "The report could not be posted");
    }
    return json({ sent: true });
  });
}

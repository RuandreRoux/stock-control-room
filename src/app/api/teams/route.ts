import { fail, json, readBody, sameOrigin, withDb } from "@/lib/api";
import { removeTeams, saveTeams, setReports, teamsStatus, webhookProblem } from "@/lib/teams";
import { sastDate } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function GET() {
  return withDb("admin", async (db) => {
    // Today's scheduled reports: when each went out and which scheduler sent it.
    const today = sastDate();
    const sent = await db
      .collection<{ _id: string; at: Date; source?: string }>("meta")
      .find({ _id: { $in: ["10", "15", "17"].map((slot) => `report:${today}:${slot}`) } })
      .toArray();
    const log = sent.map((m) => ({ slot: m._id.split(":").pop(), at: m.at.toISOString(), source: m.source ?? "Other" }));
    return json({ ...(await teamsStatus(db)), log });
  });
}

/** Save the Teams workflow address. */
export async function PUT(req: Request) {
  const body = await readBody(req);
  if (!body) return fail(400, "Invalid request");
  return withDb("admin", async (db, user) => {
    const problem = webhookProblem(body.url);
    if (problem) return fail(400, problem);
    // The address people use to reach this app, for the button on the Teams card.
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") ?? (host?.startsWith("localhost") || host?.startsWith("127.") ? "http" : "https");
    const appUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : `${proto}://${host}`;
    await saveTeams(db, body.url as string, appUrl, user.name);
    return json(await teamsStatus(db));
  });
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return fail(403, "Invalid request");
  return withDb("admin", async (db) => {
    await removeTeams(db);
    return json(await teamsStatus(db));
  });
}

/** Turn the scheduled reports on or off. */
export async function PATCH(req: Request) {
  const body = await readBody(req);
  if (!body || typeof body.reports !== "boolean") return fail(400, "Invalid request");
  return withDb("admin", async (db) => {
    if (!(await teamsStatus(db)).on) return fail(400, "Set up Teams alerts first");
    await setReports(db, body.reports as boolean);
    return json(await teamsStatus(db));
  });
}

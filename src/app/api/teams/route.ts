import { fail, json, readBody, sameOrigin, withDb } from "@/lib/api";
import { removeTeams, saveTeams, teamsStatus, webhookProblem } from "@/lib/teams";

export const dynamic = "force-dynamic";

export async function GET() {
  return withDb("admin", async (db) => json(await teamsStatus(db)));
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

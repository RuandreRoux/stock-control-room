import { fail, json, sameOrigin, withDb } from "@/lib/api";
import { postToTeams } from "@/lib/teams";

/** Post a test card to the Teams channel or chat. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "Invalid request");
  return withDb("admin", async (db, user) => {
    const result = await postToTeams(db, {
      title: "Teams alerts are working",
      lines: [{ label: "Set up by", value: user.name }],
      note: "This channel will get a message like this whenever someone signs up and is waiting for approval.",
      buttonTitle: "Open the Stock Control Room",
      path: "/admin?view=users",
    });
    return result.ok ? json({ ok: true }) : fail(502, result.error ?? "The test message could not be sent");
  });
}

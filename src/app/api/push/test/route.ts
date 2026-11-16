import { fail, json, sameOrigin, withDb } from "@/lib/api";
import { alertAdmins } from "@/lib/push";

/** Send a test alert to your own computers. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "Invalid request");
  return withDb("admin", async (db, user) => {
    const sent = await alertAdmins(
      db,
      {
        title: "Stock Control Room alerts are on",
        body: "You will see an alert like this when someone signs up and is waiting for approval.",
        url: "/admin?view=users",
        tag: "test",
      },
      user._id.toHexString(),
    );
    return sent > 0 ? json({ sent }) : fail(502, "The alert could not be delivered. Turn alerts off and on again.");
  });
}

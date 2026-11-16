import { fail, json, sameOrigin, withOpenDb } from "@/lib/api";
import { markSessionClosing } from "@/lib/auth";

/**
 * Sent by the page as the last open tab closes. The session then ends unless that
 * same tab is back within moments (a reload), so closing the browser signs you out
 * even when the browser itself keeps the cookie.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "Invalid request");
  return withOpenDb(async (db) => {
    await markSessionClosing(db);
    return json({ ok: true });
  });
}

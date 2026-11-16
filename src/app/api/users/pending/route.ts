import { json, withDb } from "@/lib/api";
import { countWaiting } from "@/lib/users";

export const dynamic = "force-dynamic";

/** How many sign-ups are waiting for approval (shown to admins in the top bar). */
export async function GET() {
  return withDb("admin", async (db) => json({ count: await countWaiting(db) }));
}

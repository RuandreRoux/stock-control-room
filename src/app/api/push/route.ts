import { fail, json, readBody, sameOrigin, withDb } from "@/lib/api";
import { hasSubscription, parseSubscription, removeSubscription, saveSubscription, vapidKeys } from "@/lib/push";

export const dynamic = "force-dynamic";

/** The public key the browser needs to subscribe, and whether this computer is already on. */
export async function GET(req: Request) {
  const endpoint = new URL(req.url).searchParams.get("endpoint");
  return withDb("admin", async (db, user) => {
    const keys = await vapidKeys(db);
    const on = endpoint ? await hasSubscription(db, user._id.toHexString(), endpoint) : false;
    return json({ publicKey: keys.publicKey, on });
  });
}

/** Turn alerts on for this computer. */
export async function POST(req: Request) {
  const body = await readBody(req);
  return withDb("admin", async (db, user) => {
    const sub = parseSubscription(body?.subscription);
    if (!sub) return fail(400, "This browser's notification details were not accepted");
    await saveSubscription(db, user._id.toHexString(), sub);
    return json({ on: true });
  });
}

/** Turn alerts off for this computer. */
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return fail(403, "Invalid request");
  const endpoint = new URL(req.url).searchParams.get("endpoint");
  if (!endpoint) return fail(400, "Invalid request");
  return withDb("admin", async (db, user) => {
    await removeSubscription(db, user._id.toHexString(), endpoint);
    return json({ on: false });
  });
}

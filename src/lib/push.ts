import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import webpush from "web-push";
import { users } from "./auth";
import { postToTeams, signUpMessage } from "./teams";

/**
 * Desktop alerts for admins (Web Push). An admin turns them on once per computer; the
 * browser then shows a notification whenever someone signs up, even with the app closed.
 *
 * The signing keys are created the first time they are needed and kept in the database,
 * so there is nothing to configure on the host.
 */

interface KeysDoc {
  _id: "vapid";
  publicKey: string;
  privateKey: string;
  createdAt: Date;
}

interface SubscriptionDoc {
  _id: string; // hash of the endpoint
  userId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  createdAt: Date;
}

const subscriptions = (db: Db) => db.collection<SubscriptionDoc>("push_subscriptions");
const endpointId = (endpoint: string) => createHash("sha256").update(endpoint).digest("hex");

/** Push services run by the browser makers. Alerts are only ever sent to these. */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/, // Chrome
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/, // Firefox
  /\.notify\.windows\.com$/, // Edge
  /^web\.push\.apple\.com$/, // Safari
];

export async function vapidKeys(db: Db): Promise<KeysDoc> {
  const meta = db.collection<KeysDoc>("meta");
  const existing = await meta.findOne({ _id: "vapid" });
  if (existing) return existing;
  const generated = webpush.generateVAPIDKeys();
  try {
    await meta.insertOne({ _id: "vapid", ...generated, createdAt: new Date() });
  } catch (err) {
    // Someone else created them at the same moment; use theirs.
    if ((err as { code?: number }).code !== 11000) throw err;
  }
  return (await meta.findOne({ _id: "vapid" }))!;
}

/** Checks a subscription sent by the browser before it is stored. */
export function parseSubscription(input: unknown): { endpoint: string; keys: { p256dh: string; auth: string } } | null {
  if (typeof input !== "object" || input === null) return null;
  const { endpoint, keys } = input as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof endpoint !== "string" || endpoint.length > 1000) return null;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !PUSH_HOSTS.some((host) => host.test(url.hostname))) return null;
  const key = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9_-]{8,200}={0,2}$/.test(value);
  if (!keys || !key(keys.p256dh) || !key(keys.auth)) return null;
  return { endpoint, keys: { p256dh: keys.p256dh as string, auth: keys.auth as string } };
}

export async function saveSubscription(db: Db, userId: string, sub: NonNullable<ReturnType<typeof parseSubscription>>) {
  await subscriptions(db).updateOne(
    { _id: endpointId(sub.endpoint) },
    { $set: { userId, endpoint: sub.endpoint, keys: sub.keys }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true },
  );
}

export async function removeSubscription(db: Db, userId: string, endpoint: string) {
  await subscriptions(db).deleteOne({ _id: endpointId(endpoint), userId });
}

export async function hasSubscription(db: Db, userId: string, endpoint: string): Promise<boolean> {
  return (await subscriptions(db).countDocuments({ _id: endpointId(endpoint), userId })) > 0;
}

/** Who the alerts come from, as push services require. */
function subject(): string {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return host ? `https://${host}` : "mailto:alerts@stock-control-room.invalid";
}

export interface Alert {
  title: string;
  body: string;
  /** Page to open when the alert is clicked. */
  url: string;
  /** Alerts with the same tag replace each other instead of piling up. */
  tag: string;
}

/**
 * Sends an alert to every computer where an active admin turned alerts on (or only to
 * `onlyUserId`). Never throws and gives up after a few seconds, so it cannot hold up or
 * break whatever triggered it. Subscriptions the push service says are gone are removed.
 */
export async function alertAdmins(db: Db, alert: Alert, onlyUserId?: string): Promise<number> {
  try {
    const admins = await users(db)
      .find({ role: "admin", active: true }, { projection: { _id: 1 } })
      .toArray();
    const adminIds = admins.map((a) => a._id.toHexString()).filter((id) => !onlyUserId || id === onlyUserId);
    if (adminIds.length === 0) return 0;
    const targets = await subscriptions(db).find({ userId: { $in: adminIds } }).toArray();
    if (targets.length === 0) return 0;

    const keys = await vapidKeys(db);
    const payload = JSON.stringify(alert);
    const options = {
      vapidDetails: { subject: subject(), publicKey: keys.publicKey, privateKey: keys.privateKey },
      TTL: 24 * 60 * 60,
      urgency: "high" as const,
      timeout: 4000,
    };
    const results = await Promise.allSettled(
      targets.map((t) => webpush.sendNotification({ endpoint: t.endpoint, keys: t.keys }, payload, options)),
    );
    let sent = 0;
    const gone: string[] = [];
    results.forEach((result, i) => {
      if (result.status === "fulfilled") sent += 1;
      else {
        const status = (result.reason as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(targets[i]._id);
        else console.warn("Could not send an alert", status ?? result.reason);
      }
    });
    if (gone.length) await subscriptions(db).deleteMany({ _id: { $in: gone } });
    return sent;
  } catch (err) {
    console.warn("Could not send alerts", err);
    return 0;
  }
}

/** Alert admins about a new sign-up (desktop alerts and Teams), waiting at most a few seconds. */
export async function alertNewSignUp(db: Db, name: string, username: string): Promise<void> {
  const send = Promise.allSettled([
    alertAdmins(db, {
      title: "New sign-up waiting for approval",
      body: `${name} (${username}) wants to use the Stock Control Room.`,
      url: "/admin?view=users",
      tag: "signup",
    }),
    postToTeams(db, signUpMessage(name, username)),
  ]);
  await Promise.race([send, new Promise((resolve) => setTimeout(resolve, 5500))]);
}

import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { ObjectId, type Db } from "mongodb";
import { passwordRules } from "./password-rules";
import type { Role, SessionUser } from "./types";

/**
 * Sign-in is by individual account. A session is a random token held in a browser-session
 * cookie and recorded on the server. The server, not the cookie, decides when it ends:
 *  - on sign-out, immediately;
 *  - when the last tab of the app is closed (the page tells the server as it goes);
 *  - when nothing has been heard from the browser for 30 minutes (covers a crash, a
 *    phone that killed the browser, or a computer put to sleep);
 *  - after 12 hours, whatever happens.
 * Browsers often keep "session" cookies when they restore tabs, so the cookie going
 * away is never relied on.
 */
export const COOKIE = "scr_session";
export const SESSION_HOURS = 12;
const IDLE_MS = 30 * 60 * 1000;
/** After the page says it is closing, how long a reload of the same tab has to check in. */
const CLOSING_GRACE_MS = 45 * 1000;
const TOUCH_EVERY_MS = 15 * 1000;

export interface UserDoc {
  _id: ObjectId;
  username: string; // lower case, unique
  name: string;
  role: Role;
  /** The responsible or accountable name this person goes by on the check sheet, if any. */
  person: string;
  passwordHash: string;
  mustChangePassword: boolean;
  active: boolean;
  /** Signed up by themselves and waiting for an admin to approve. Always inactive until approved. */
  pending?: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
}

interface SessionDoc {
  _id: string; // SHA-256 of the token; the token itself is never stored
  userId: ObjectId;
  createdAt: Date;
  expiresAt: Date;
  /** Last time the browser checked in. */
  lastSeenAt?: Date;
  /** Set when the last open tab reported that it was closing. */
  closingAt?: Date | null;
}

interface ThrottleDoc {
  _id: string;
  count: number;
  expiresAt: Date;
}

export const users = (db: Db) => db.collection<UserDoc>("users");
const sessions = (db: Db) => db.collection<SessionDoc>("sessions");
const throttle = (db: Db) => db.collection<ThrottleDoc>("throttle");

// ---------- Passwords ----------

// scrypt with N=2^15, r=8, p=3 (an OWASP-recommended setting).
const SCRYPT = { N: 32768, r: 8, p: 3, maxmem: 96 * 1024 * 1024 };
const KEY_BYTES = 64;

function derive(password: string, salt: Buffer, options = SCRYPT): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, KEY_BYTES, options, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, N, r, p, salt, key] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "base64");
  const actual = await derive(password, Buffer.from(salt, "base64"), {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Spends the same time as a real check, so a wrong username cannot be told from a wrong password. */
export async function fakeVerify(): Promise<void> {
  await derive("not-a-real-password", Buffer.alloc(16));
}

// Passwords that meet the rules on paper but are among the first anyone would guess.
const COMMON = new Set([
  "password1!",
  "passw0rd!",
  "passw0rd1!",
  "welcome1!",
  "welcome2026!",
  "qwerty123!",
  "abcd1234!",
  "abc12345!",
  "agritech1!",
  "password123!",
  "passw0rd123!",
  "welcome123!",
  "welcome2026!",
  "qwerty12345!",
  "agritech123!",
  "technovation1!",
  "stockcontrol1!",
]);

/** Returns what is wrong with a new password, or null when it is acceptable. */
export function passwordProblem(password: unknown): string | null {
  if (typeof password !== "string") return "Enter a password";
  if (password.length > 200) return "That password is too long";
  const failed = passwordRules(password).find((rule) => !rule.ok);
  if (failed) return `The password needs: ${failed.label.charAt(0).toLowerCase()}${failed.label.slice(1)}`;
  if (COMMON.has(password.toLowerCase())) return "That password is too easy to guess";
  return null;
}

export function usernameProblem(username: unknown): string | null {
  if (typeof username !== "string" || !/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username)) {
    return "Usernames are 3 to 40 characters: lower-case letters, numbers, dots, dashes or underscores";
  }
  return null;
}

// ---------- Guessing limits ----------

const WINDOW_MS = 15 * 60 * 1000;
export const MAX_PER_USERNAME = 10;
const MAX_PER_ADDRESS = 30;

export async function clientAddress(): Promise<string> {
  const forwarded = (await headers()).get("x-forwarded-for") ?? "";
  return forwarded.split(",")[0].trim() || "unknown";
}

/** Whether a counter (failed sign-ins, sign-ups, ...) has reached its limit for the current 15 minutes. */
export async function blocked(db: Db, key: string, max: number): Promise<boolean> {
  const doc = await throttle(db).findOne({ _id: key });
  if (!doc) return false;
  if (doc.expiresAt.getTime() <= Date.now()) {
    await throttle(db).deleteOne({ _id: key });
    return false;
  }
  return doc.count >= max;
}

/** Whether sign-in is paused for this username or this network address after repeated failures. */
export async function signInBlocked(db: Db, username: string, address: string): Promise<boolean> {
  const [byName, byAddress] = await Promise.all([
    blocked(db, `user:${username}`, MAX_PER_USERNAME),
    blocked(db, `addr:${address}`, MAX_PER_ADDRESS),
  ]);
  return byName || byAddress;
}

export async function recordFailure(db: Db, username: string, address: string): Promise<void> {
  const expiresAt = new Date(Date.now() + WINDOW_MS);
  await Promise.all(
    [`user:${username}`, `addr:${address}`].map((key) =>
      throttle(db).updateOne({ _id: key }, { $inc: { count: 1 }, $setOnInsert: { expiresAt } }, { upsert: true }),
    ),
  );
}

/** Adds one to a counter that resets 15 minutes after its first count. */
export async function bump(db: Db, key: string): Promise<void> {
  const expiresAt = new Date(Date.now() + WINDOW_MS);
  await throttle(db).updateOne({ _id: key }, { $inc: { count: 1 }, $setOnInsert: { expiresAt } }, { upsert: true });
}

export async function clearFailures(db: Db, username: string): Promise<void> {
  await throttle(db).deleteOne({ _id: `user:${username}` });
}

// ---------- Sessions ----------

const digest = (token: string) => createHash("sha256").update(token).digest("hex");

export function toSessionUser(user: UserDoc): SessionUser {
  return {
    id: user._id.toHexString(),
    username: user.username,
    name: user.name,
    role: user.role,
    person: user.person,
    mustChangePassword: user.mustChangePassword,
  };
}

/** Starts a session and sets the cookie. No expiry on the cookie: it ends with the browser session. */
export async function startSession(db: Db, user: UserDoc): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  await sessions(db).insertOne({
    _id: digest(token),
    userId: user._id,
    createdAt: now,
    expiresAt: new Date(now.getTime() + SESSION_HOURS * 60 * 60 * 1000),
    lastSeenAt: now,
    closingAt: null,
  });
  await users(db).updateOne({ _id: user._id }, { $set: { lastLoginAt: now } });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

/**
 * The signed-in user, or null. Checks the server-side session on every request.
 * `tab` is sent when a page first loads: "new" for a tab the app has not been open in
 * before, "known" for a reload of a tab that was already using it.
 */
export async function currentUser(db: Db, tab?: "new" | "known"): Promise<UserDoc | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || token.length > 200) return null;
  const session = await sessions(db).findOne({ _id: digest(token) });
  if (!session) return null;

  const now = Date.now();
  const lastSeen = (session.lastSeenAt ?? session.createdAt).getTime();
  const closing = session.closingAt ? session.closingAt.getTime() : null;
  const over =
    session.expiresAt.getTime() <= now ||
    now - lastSeen > IDLE_MS ||
    // Every tab was closed. Only a quick reload of one of those tabs may carry on;
    // a fresh tab or window (the browser was closed and opened again) has to sign in.
    (closing !== null && (tab === "new" || now - closing > CLOSING_GRACE_MS));
  if (over) {
    await sessions(db).deleteOne({ _id: session._id });
    return null;
  }
  if (closing !== null || now - lastSeen > TOUCH_EVERY_MS) {
    await sessions(db).updateOne({ _id: session._id }, { $set: { lastSeenAt: new Date(now), closingAt: null } });
  }
  const user = await users(db).findOne({ _id: session.userId });
  return user && user.active ? user : null;
}

/** The last open tab is closing: the session ends unless that same tab checks back in straight away. */
export async function markSessionClosing(db: Db): Promise<void> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || token.length > 200) return;
  await sessions(db).updateOne({ _id: digest(token), closingAt: null }, { $set: { closingAt: new Date() } });
}

/** Ends the current session on the server and removes the cookie. */
export async function endSession(db: Db): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await sessions(db).deleteOne({ _id: digest(token) });
  jar.delete(COOKIE);
}

/** Ends every session a user has, optionally keeping the one making this request. */
export async function endUserSessions(db: Db, userId: ObjectId, keepCurrent = false): Promise<void> {
  const token = keepCurrent ? (await cookies()).get(COOKIE)?.value : undefined;
  await sessions(db).deleteMany(token ? { userId, _id: { $ne: digest(token) } } : { userId });
}

export async function ensureAuthIndexes(db: Db): Promise<void> {
  await users(db).createIndex({ username: 1 }, { unique: true });
  await sessions(db).createIndex({ userId: 1 });
  // Housekeeping only: the database clears out expired sessions and counters by itself.
  // Expiry is always checked in code as well, so sign-in never depends on these indexes.
  try {
    await sessions(db).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await throttle(db).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  } catch (err) {
    console.warn("Could not create the clean-up indexes", err);
  }
}

import { fail, json, readBody, sameOrigin, withOpenDb } from "@/lib/api";
import {
  clearFailures,
  clientAddress,
  currentUser,
  endSession,
  fakeVerify,
  recordFailure,
  signInBlocked,
  startSession,
  toSessionUser,
  users,
  verifyPassword,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Who is signed in (or null). */
export async function GET() {
  return withOpenDb(async (db) => {
    const user = await currentUser(db);
    return json({ user: user ? toSessionUser(user) : null });
  });
}

/** Sign in. */
export async function POST(req: Request) {
  const body = await readBody(req);
  const username = typeof body?.username === "string" ? body.username.trim().toLowerCase().slice(0, 80) : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!username || !password || password.length > 200) return fail(400, "Enter your username and password");

  return withOpenDb(async (db) => {
    const address = await clientAddress();
    if (await signInBlocked(db, username, address)) {
      return fail(429, "Too many attempts. Please wait 15 minutes and try again.");
    }
    const user = await users(db).findOne({ username });
    let ok = false;
    if (user && user.active) ok = await verifyPassword(password, user.passwordHash);
    else await fakeVerify();
    if (!ok || !user) {
      await recordFailure(db, username, address);
      // The same answer whether the username or the password was wrong.
      return fail(401, "The username or password is not correct");
    }
    await clearFailures(db, username);
    await startSession(db, user);
    return json({ user: toSessionUser(user) });
  });
}

/** Sign out: the session is deleted on the server, so the cookie can never be used again. */
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return fail(403, "Invalid request");
  return withOpenDb(async (db) => {
    await endSession(db);
    return json({ ok: true });
  });
}

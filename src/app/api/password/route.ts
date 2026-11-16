import { fail, json, readBody, withDb } from "@/lib/api";
import {
  clientAddress,
  endUserSessions,
  hashPassword,
  passwordProblem,
  recordFailure,
  signInBlocked,
  users,
  verifyPassword,
} from "@/lib/auth";

/** Change your own password. Also how a temporary password is replaced at first sign-in. */
export async function POST(req: Request) {
  const body = await readBody(req);
  const current = typeof body?.current === "string" ? body.current : "";
  const next = body?.next;
  if (!current) return fail(400, "Enter your current password");

  return withDb(
    "user",
    async (db, user) => {
      const address = await clientAddress();
      if (await signInBlocked(db, user.username, address)) {
        return fail(429, "Too many attempts. Please wait 15 minutes and try again.");
      }
      if (!(await verifyPassword(current, user.passwordHash))) {
        await recordFailure(db, user.username, address);
        return fail(400, "Your current password is not correct");
      }
      const problem = passwordProblem(next) ?? (next === current ? "Choose a different password" : null);
      if (problem) return fail(400, problem);
      await users(db).updateOne(
        { _id: user._id },
        { $set: { passwordHash: await hashPassword(next as string), mustChangePassword: false, updatedAt: new Date() } },
      );
      // Any other device signed in with the old password is signed out.
      await endUserSessions(db, user._id, true);
      return json({ ok: true });
    },
    { duringPasswordChange: true },
  );
}

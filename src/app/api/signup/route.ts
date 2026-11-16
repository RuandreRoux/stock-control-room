import { fail, json, readBody, withOpenDb } from "@/lib/api";
import { clientAddress } from "@/lib/auth";
import { signUp } from "@/lib/users";

/** Create your own account. It stays locked until an admin approves it. */
export async function POST(req: Request) {
  const body = await readBody(req);
  if (!body) return fail(400, "Invalid request");
  return withOpenDb(async (db) => {
    const result = await signUp(db, body, await clientAddress());
    return "error" in result ? fail(result.status, result.error) : json({ ok: true }, 201);
  });
}

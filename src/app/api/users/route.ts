import { fail, json, readBody, withDb } from "@/lib/api";
import { createUser, listUsers } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function GET() {
  return withDb("admin", async (db) => json({ users: await listUsers(db) }));
}

export async function POST(req: Request) {
  const body = await readBody(req);
  if (!body) return fail(400, "Invalid request");
  return withDb("admin", async (db) => {
    const result = await createUser(db, body);
    return "error" in result ? fail(result.status, result.error) : json(result.account, 201);
  });
}

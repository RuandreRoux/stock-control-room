import { fail, json, readBody, sameOrigin, withDb } from "@/lib/api";
import { rejectSignUp, updateUser } from "@/lib/users";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readBody(req);
  if (!body) return fail(400, "Invalid request");
  return withDb("admin", async (db, actor) => {
    const result = await updateUser(db, id, body, actor);
    return "error" in result ? fail(result.status, result.error) : json(result.account);
  });
}

/** Reject a sign-up that is waiting for approval. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!sameOrigin(req)) return fail(403, "Invalid request");
  return withDb("admin", async (db) => {
    const result = await rejectSignUp(db, id);
    return "error" in result ? fail(result.status, result.error) : json({ ok: true });
  });
}

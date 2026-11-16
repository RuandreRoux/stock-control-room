import { fail, json, readBody, withDb } from "@/lib/api";
import { updateUser } from "@/lib/users";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readBody(req);
  if (!body) return fail(400, "Invalid request");
  return withDb("admin", async (db, actor) => {
    const result = await updateUser(db, id, body, actor);
    return "error" in result ? fail(result.status, result.error) : json(result.account);
  });
}

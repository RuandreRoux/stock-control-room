import { NextResponse } from "next/server";
import { fail, json, readBody } from "@/lib/api";
import { adminCodeRequired, COOKIE, getRole, roleForCode, sessionValue } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  return json({ role: await getRole(), adminCodeRequired: adminCodeRequired() });
}

export async function POST(req: Request) {
  const body = await readBody(req);
  const code = typeof body?.code === "string" ? body.code : "";
  const role = roleForCode(code);
  if (!role) {
    await new Promise((resolve) => setTimeout(resolve, 600)); // slow down guessing
    return fail(401, "That access code is not correct");
  }
  const res = NextResponse.json({ role });
  res.cookies.set(COOKIE, sessionValue(role), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE);
  return res;
}

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { Role } from "./types";

/**
 * Access is controlled by two optional environment variables:
 *   APP_ACCESS_CODE   - shared code the teams use to open the app
 *   ADMIN_ACCESS_CODE - code for the admin page and for correcting previous days
 * If a code is not set, that level is open to everyone.
 */
export const COOKIE = "scr_session";

const appCode = () => process.env.APP_ACCESS_CODE || "";
const adminCode = () => process.env.ADMIN_ACCESS_CODE || "";

function sign(role: string): string {
  return createHmac("sha256", `scr|${appCode()}|${adminCode()}`).update(role).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function sessionValue(role: "team" | "admin"): string {
  return `${role}.${sign(role)}`;
}

/** Which role a submitted access code grants, if any. */
export function roleForCode(code: string): "team" | "admin" | null {
  if (adminCode() && safeEqual(code, adminCode())) return "admin";
  if (appCode() && safeEqual(code, appCode())) return "team";
  return null;
}

export async function getRole(): Promise<Role> {
  const value = (await cookies()).get(COOKIE)?.value ?? "";
  const [role, signature] = value.split(".");
  const signedIn = (role === "team" || role === "admin") && !!signature && safeEqual(signature, sign(role));
  const open: Role = adminCode() ? "team" : "admin";
  if (signedIn) return role === "admin" ? "admin" : open;
  return appCode() ? "none" : open;
}

export const adminCodeRequired = () => !!adminCode();

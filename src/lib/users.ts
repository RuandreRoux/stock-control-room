import { ObjectId, type Db } from "mongodb";
import {
  blocked,
  bump,
  endUserSessions,
  hashPassword,
  passwordProblem,
  usernameProblem,
  users,
  type UserDoc,
} from "./auth";
import { alertNewSignUp } from "./push";
import type { Role, UserAccount } from "./types";

function toAccount(user: UserDoc): UserAccount {
  return {
    id: user._id.toHexString(),
    username: user.username,
    name: user.name,
    role: user.role,
    person: user.person,
    mustChangePassword: user.mustChangePassword,
    active: user.active,
    pending: !!user.pending,
    createdAt: new Date(user.createdAt).toISOString(),
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
  };
}

export async function listUsers(db: Db): Promise<UserAccount[]> {
  const docs = await users(db).find().toArray();
  return docs.map(toAccount).sort((a, b) => a.name.localeCompare(b.name));
}

const text = (value: unknown, max: number): string | null =>
  typeof value === "string" && value.trim().length <= max ? value.trim() : null;

const asRole = (value: unknown): Role | null => (value === "admin" || value === "user" ? value : null);

type Result = { account: UserAccount } | { error: string; status: number };

export async function createUser(db: Db, input: Record<string, unknown>): Promise<Result> {
  const username = typeof input.username === "string" ? input.username.trim().toLowerCase() : "";
  const name = text(input.name, 80);
  const person = text(input.person ?? "", 200);
  const role = asRole(input.role ?? "user");
  const problem =
    usernameProblem(username) ??
    (!name ? "Enter the person's name" : null) ??
    (person === null || !role ? "Invalid details" : null) ??
    passwordProblem(input.password);
  if (problem) return { error: problem, status: 400 };

  const now = new Date();
  const doc: UserDoc = {
    _id: new ObjectId(),
    username,
    name: name!,
    role: role!,
    person: person!,
    passwordHash: await hashPassword(input.password as string),
    // The admin sets a temporary password; the person chooses their own at first sign-in.
    mustChangePassword: true,
    active: true,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null,
  };
  try {
    await users(db).insertOne(doc);
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return { error: "That username is already taken", status: 409 };
    throw err;
  }
  return { account: toAccount(doc) };
}

export async function updateUser(db: Db, id: string, input: Record<string, unknown>, actor: UserDoc): Promise<Result> {
  if (!ObjectId.isValid(id)) return { error: "User not found", status: 404 };
  const _id = new ObjectId(id);
  const target = await users(db).findOne({ _id });
  if (!target) return { error: "User not found", status: 404 };
  const self = target._id.equals(actor._id);

  const set: Partial<UserDoc> = { updatedAt: new Date() };
  let endSessions = false;

  if (input.name !== undefined) {
    const name = text(input.name, 80);
    if (!name) return { error: "Enter the person's name", status: 400 };
    set.name = name;
  }
  if (input.person !== undefined) {
    const person = text(input.person, 200);
    if (person === null) return { error: "Invalid details", status: 400 };
    set.person = person;
  }
  if (input.role !== undefined) {
    const role = asRole(input.role);
    if (!role) return { error: "Invalid role", status: 400 };
    // Stops the last admin from locking everyone out of the Admin page by mistake.
    if (self && role !== target.role) return { error: "You cannot change your own role", status: 400 };
    set.role = role;
  }
  if (input.approve === true) {
    if (!target.pending) return { error: "That account is not waiting for approval", status: 400 };
    set.pending = false;
    set.active = true;
  } else if (target.pending) {
    return { error: "Approve the account before changing it", status: 400 };
  }
  if (input.active !== undefined) {
    if (typeof input.active !== "boolean") return { error: "Invalid details", status: 400 };
    if (self && !input.active) return { error: "You cannot deactivate your own account", status: 400 };
    set.active = input.active;
    if (!input.active) endSessions = true;
  }
  if (input.password !== undefined) {
    const problem = passwordProblem(input.password);
    if (problem) return { error: problem, status: 400 };
    set.passwordHash = await hashPassword(input.password as string);
    set.mustChangePassword = true;
    endSessions = true;
  }

  const updated = await users(db).findOneAndUpdate({ _id }, { $set: set }, { returnDocument: "after" });
  if (!updated) return { error: "User not found", status: 404 };
  // A reset password or a deactivated account signs that person out everywhere, at once.
  if (endSessions) await endUserSessions(db, _id, self);
  return { account: toAccount(updated) };
}

// ---------- Signing up ----------

const MAX_SIGNUPS_PER_ADDRESS = 5;
const MAX_WAITING = 50;

/**
 * Someone creates their own account. It can do nothing until an admin approves it,
 * and it is always an ordinary user: the role is never taken from the request.
 */
export async function signUp(
  db: Db,
  input: Record<string, unknown>,
  address: string,
): Promise<{ ok: true } | { error: string; status: number }> {
  const username = typeof input.username === "string" ? input.username.trim().toLowerCase() : "";
  const name = text(input.name, 80);
  const problem =
    (!name ? "Enter your name" : null) ?? usernameProblem(username) ?? passwordProblem(input.password);
  if (problem) return { error: problem, status: 400 };

  if (await blocked(db, `signup:${address}`, MAX_SIGNUPS_PER_ADDRESS)) {
    return { error: "Too many sign-ups from here. Please wait 15 minutes and try again.", status: 429 };
  }
  if ((await users(db).countDocuments({ pending: true })) >= MAX_WAITING) {
    return { error: "Too many sign-ups are waiting for approval. Please ask Ruandre to approve them first.", status: 429 };
  }
  await bump(db, `signup:${address}`);

  const now = new Date();
  try {
    await users(db).insertOne({
      _id: new ObjectId(),
      username,
      name: name!,
      role: "user",
      person: "",
      passwordHash: await hashPassword(input.password as string),
      mustChangePassword: false,
      active: false,
      pending: true,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null,
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      return { error: "That username is already taken. Please choose another.", status: 409 };
    }
    throw err;
  }
  await alertNewSignUp(db, name!, username);
  return { ok: true };
}

/** Rejecting a sign-up removes it, which also frees the username. Approved accounts are deactivated, not deleted. */
export async function rejectSignUp(db: Db, id: string): Promise<{ ok: true } | { error: string; status: number }> {
  if (!ObjectId.isValid(id)) return { error: "User not found", status: 404 };
  const result = await users(db).deleteOne({ _id: new ObjectId(id), pending: true });
  return result.deletedCount ? { ok: true } : { error: "That account is not waiting for approval", status: 400 };
}

export const countWaiting = (db: Db) => users(db).countDocuments({ pending: true });

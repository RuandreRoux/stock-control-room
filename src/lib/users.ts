import { ObjectId, type Db } from "mongodb";
import { endUserSessions, hashPassword, passwordProblem, usernameProblem, users, type UserDoc } from "./auth";
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
    passwordProblem(input.password, username);
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
  if (input.active !== undefined) {
    if (typeof input.active !== "boolean") return { error: "Invalid details", status: 400 };
    if (self && !input.active) return { error: "You cannot deactivate your own account", status: 400 };
    set.active = input.active;
    if (!input.active) endSessions = true;
  }
  if (input.password !== undefined) {
    const problem = passwordProblem(input.password, target.username);
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

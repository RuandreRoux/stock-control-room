// Prints the database record for a first admin account, to insert into the `users` collection.
// Every later account is created on the Admin page; this is only for the very first one.
//
//   node scripts/create-admin.mjs <username> "<Full name>" "<temporary password>"
//
// The password settings must match src/lib/auth.ts.
import { randomBytes, scryptSync } from "node:crypto";

const [username, name, password] = process.argv.slice(2);
if (!username || !name || !password || password.length < 10) {
  console.error('Usage: node scripts/create-admin.mjs <username> "<Full name>" "<temporary password, 10+ characters>"');
  process.exit(1);
}
const N = 32768, r = 8, p = 3;
const salt = randomBytes(16);
const key = scryptSync(password.normalize("NFKC"), salt, 64, { N, r, p, maxmem: 96 * 1024 * 1024 });
const now = { $date: new Date().toISOString() };
console.log(
  JSON.stringify(
    {
      username: username.toLowerCase(),
      name,
      role: "admin",
      person: "",
      passwordHash: ["scrypt", N, r, p, salt.toString("base64"), key.toString("base64")].join("$"),
      mustChangePassword: true,
      active: true,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null,
    },
    null,
    2,
  ),
);

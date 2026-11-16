# Stock Control Room

Daily document checks between physical stock movements and system stock, for the Wellington site.
Replaces the shared Excel checklist so that every team works on one version and each day is kept on record.

## How it works

- A **check day** covers documents from 06:00 on the previous working day to 06:00 on the day (South African time). Monday therefore covers Friday 06:00 to Monday 06:00.
- Checks run Monday to Friday. Weekends and South African public holidays have no sheet (see `src/lib/time.ts`; once-off declared holidays such as election days are not included).
- Each line has two checks, both due by the line's physical reporting time (10:00 by default):
  1. **Physical count** - the responsible person counts the completed documents.
  2. **DC received** - the data capturer confirms how many documents were received.
- The two counts must match. Whether the documents were then captured in the system is not tracked.
- Ticking a check with no number counts as zero documents. Entering a number ticks the check.
- Lines whose physical responsible person is `N/A` only have the DC received check.
- Today's sheet is editable by every signed-in user. Previous days are locked; an admin can unlock a day to correct it.

## Pages

| Page | Purpose |
|---|---|
| Daily checks (`/`) | The check sheet. Filter by responsible person, accountable person, category, to-do or exceptions; add comments per check. |
| Exceptions dashboard (`/exceptions`) | Checks not done (by accountable person, then responsible person, then each missed check) and count mismatches, each with a graph per working day, plus the last 10 working days. |
| Admin (`/admin`) | Add, edit, duplicate or deactivate lines. People are picked from a list to keep names consistent. Edits apply from today onwards; history keeps the details it was checked against. |

## Data

MongoDB database `stock_control_room`:

- `lines` - the checklist lines (the columns of the Excel template).
- `checks` - one record per line per day, with a copy of the line details for that day and the two checks.
- `meta` - a marker so the starting lines are only loaded once.
- `users` - accounts (username, name, role, password hash).
- `sessions` - signed-in sessions, removed on sign-out and after 12 hours.
- `throttle` - short-lived counters of failed sign-in attempts.

On first run against an empty database the app loads the 124 lines from the template (`src/lib/seed-lines.json`).

## Sign-in and security

- Everyone signs in with their own username and password. There are no shared codes.
- **Roles:** a *user* can do the daily checks and see the dashboard. An *admin* can also edit lines, manage users and correct previous days.
- **Accounts:** people create their own account on the sign-in screen (name, username, password). It can do nothing until an admin approves it on the Admin page (Users tab); a rejected sign-up is removed. A sign-up is always an ordinary user. Admins can also add someone directly with a temporary password, which must be replaced at first sign-in.
- Admins can reset a password or deactivate an account; both sign that person out at once.
- **Passwords** are stored only as salted scrypt hashes. A new password needs at least 10 characters with an upper-case letter, a lower-case letter, a number and a special character, and must not contain the username.
- **Sessions** are recorded on the server, which decides when they end (browsers often keep "session" cookies, so the cookie is not relied on). A session ends:
  - on sign-out, immediately;
  - when the last tab with the app is closed (the page tells the server as it closes; a quick reload of the same tab carries on);
  - after 30 minutes with no contact from the browser (covers a crash, a phone closing the browser, or a sleeping computer);
  - after 12 hours regardless.
  Only a hash of the session token is stored.
- **Guessing:** five wrong passwords for a username lock sign-in for that username for 15 minutes. Sign-ups are limited per network address, and at most 50 can be waiting for approval.
- Each check records the signed-in person's name; the browser cannot supply a different one.

### The first admin

Every account after the first is created in the app. To create the very first admin, generate a record and insert it into the `users` collection:

```bash
node scripts/create-admin.mjs <username> "<Full name>" "<temporary password>"
```

## Configuration

See `.env.example`. Set the same variables in Vercel under Project Settings > Environment Variables.

| Variable | Required | Purpose |
|---|---|---|
| `MONGODB_URI` | yes | Atlas connection string |
| `MONGODB_DB` | no | Database name, defaults to `stock_control_room` |

Atlas must allow connections from Vercel (Network Access).

## Development

```bash
cp .env.example .env.local
```

```bash
npm install
```

```bash
npm run dev
```

Built with Next.js (App Router), Tailwind CSS and the official MongoDB driver.

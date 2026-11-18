# Stock Control Room

Daily document checks between physical stock movements and system stock, for the Wellington site.
Replaces the shared Excel checklist so that every team works on one version and each day is kept on record.

## How it works

- **The sheet for a day** collects documents from 06:00 that day until 05:59 on the next working day (a Friday sheet runs until Monday 05:59), so the team fills it in as the day goes.
- Its counts are due at **10:00 on the next working day**. After 10:00 the team resolves what was reported: data capturers by 15:00, the physical team by the end of that day.
- Checks run Monday to Friday. Weekends and South African public holidays have no sheet (see `src/lib/time.ts`; once-off declared holidays such as election days are not included).
- Every sheet stays editable. The screens show the sheet due today and the one being filled in as large cards, keep a coloured "Working on" bar on screen, announce every switch of sheet, and ask for confirmation before the first change to an earlier sheet.
- Each line has two checks, both due by the line's physical reporting time (10:00 by default) on the next working day:
  1. **Physical count** - the responsible person counts the completed documents.
  2. **DC received** - the data capturer confirms how many documents were received.
- The two counts must match. Whether the documents were then captured in the system is not tracked.
- Ticking a check with no number counts as zero documents. Entering a number ticks the check.
- Lines whose physical responsible person is `N/A` only have the DC received check.

## Pages

| Page | Purpose |
|---|---|
| Daily checks (`/`) | The check sheet. Filter by responsible person, accountable person, category, to-do or exceptions; add comments per check. |
| Exceptions dashboard (`/exceptions`) | Checks not done (by accountable person, then responsible person, then each missed check) and count mismatches, each with a graph per working day, plus the last 10 working days. |
| Admin (`/admin`) | Add, edit, duplicate or deactivate lines. People are picked from a list to keep names consistent. Edits apply to the sheet being filled in and the sheet due today, so the reports follow straight away; earlier sheets keep their details unless "Also correct all earlier sheets" is ticked. |

## Data

MongoDB database `stock_control_room`:

- `lines` - the checklist lines (the columns of the Excel template).
- `checks` - one record per line per day, with a copy of the line details for that day and the two checks.
- `meta` - a marker so the starting lines are only loaded once.
- `users` - accounts (username, name, role, password hash).
- `sessions` - signed-in sessions, removed on sign-out and after 12 hours.
- `throttle` - short-lived counters of failed sign-in attempts.
- `push_subscriptions` - computers where an admin turned desktop alerts on.

On first run against an empty database the app loads the 124 lines from the template (`src/lib/seed-lines.json`).

## Sign-in and security

- Everyone signs in with their own username and password. There are no shared codes.
- **Roles:** a *user* can do the daily checks and see the dashboard. An *admin* can also edit lines, manage users and correct previous days.
- **Mismatch reasons:** on the Exceptions Dashboard, each count mismatch has a Reason column; the reason is saved with that sheet (with who wrote it and when) and also shows in the line's details on Daily Checks.
- **Accounts:** people create their own account on the sign-in screen (name, username, password). It can do nothing until an admin approves it on the Admin page (Users tab); a rejected sign-up is removed. A sign-up is always an ordinary user. Admins can also add someone directly with a temporary password, which must be replaced at first sign-in.
- Admins can reset a password or deactivate an account; both sign that person out at once.
- **Passwords** are stored only as salted scrypt hashes. A new password needs at least 8 characters with an upper-case letter, a lower-case letter, a number and a special character.
- **Sessions** are recorded on the server, which decides when they end (browsers often keep "session" cookies, so the cookie is not relied on). A session ends:
  - on sign-out, immediately;
  - when the last tab with the app is closed (the page tells the server as it closes; a quick reload of the same tab carries on);
  - after 30 minutes with no contact from the browser (covers a crash, a phone closing the browser, or a sleeping computer);
  - after 12 hours regardless.
  Only a hash of the session token is stored.
- **Guessing:** ten wrong passwords for a username lock sign-in for that username for 15 minutes. Sign-ups are limited per network address, and at most 50 can be waiting for approval.
- Each check records the signed-in person's name; the browser cannot supply a different one.

### The first admin

Every account after the first is created in the app. To create the very first admin, generate a record and insert it into the `users` collection:

```bash
node scripts/create-admin.mjs <username> "<Full name>" "<temporary password>"
```

## Desktop alerts for admins

Admins can turn on desktop alerts on Admin > Users ("Turn on alerts"), once per computer. Chrome then shows a notification whenever someone signs up and is waiting for approval, even when the app is closed, as long as Chrome is running. Clicking it opens Admin > Users.

- Uses standard Web Push. The signing keys are created on first use and stored in the `meta` collection, so there is nothing to configure on the host.
- Alerts are only sent to the browser makers' push services (Google, Mozilla, Microsoft, Apple), are encrypted so only that browser can read them, and go only to active admins.
- A computer whose alerts the push service reports as gone is removed automatically.
- Sending an alert never delays a sign-up by more than about 5 seconds, and a failure never stops the sign-up.

### Teams alerts

An admin can also have new sign-ups posted to a Microsoft Teams channel or chat (Admin > Users > Teams alerts). In Teams, create a workflow from the "Send webhook alerts to a channel" template, copy the address it gives you and paste it on the Admin page. The address is stored in the `meta` collection; only Microsoft workflow addresses are accepted. Names typed on the sign-up form are stripped of formatting characters before they are posted.

### Daily Teams reports

When Teams alerts are set up, the app also posts a report to the same chat at 10:00, 15:00 and 18:00 (SAST) on working days, about the sheet due that day: checks done and not done (grouped by accountable, then responsible person) and any count mismatches, with a link to the dashboard. Admins can switch the reports off, or post one straight away for any sheet they choose, on Admin > Users.

- The schedule is an external timer (cron-job.org) that calls `/api/cron/report/10`, `/15` and `/18` with `?source=timer` at 10:05, 15:05 and 18:05 on weekdays. A GitHub Actions workflow (`.github/workflows/teams-reports.yml`) is the backup, at 10, 20 and 30 minutes past. The app sends each report only once per day. The Admin page shows when each of today's reports went out and who sent it.
- The GitHub workflow can also be run by hand (Actions > Teams reports > Run workflow).
- Each report goes out at most once per day, only on working days and only within two hours of its time.
- Optional: set `CRON_SECRET` in Vercel and the same value as a GitHub Actions secret called `CRON_SECRET`, so only the schedule can trigger the reports.

## Configuration

See `.env.example`. Set the same variables in Vercel under Project Settings > Environment Variables.

| Variable | Required | Purpose |
|---|---|---|
| `MONGODB_URI` | yes | Atlas connection string |
| `MONGODB_DB` | no | Database name, defaults to `stock_control_room` |
| `CRON_SECRET` | recommended | Any long random text; set the same value as a GitHub Actions secret so only the schedule can trigger the daily reports |

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

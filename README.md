# Stock Control Room

Daily document checks between physical stock movements and system stock, for the Wellington site.
Replaces the shared Excel checklist so that every team works on one version and each day is kept on record.

## How it works

- A **check day** covers documents from 06:00 on the previous working day to 06:00 on the day (South African time). Monday therefore covers Friday 06:00 to Monday 06:00.
- Checks run Monday to Friday. Weekends and South African public holidays have no sheet (see `src/lib/time.ts`; once-off declared holidays such as election days are not included).
- Each line has three checks:
  1. **Physical count** - the responsible person counts the completed documents (due by the line's physical reporting time, 10:00 by default).
  2. **DC received** - the data capturer confirms how many documents were handed over (also due by the physical reporting time).
  3. **Captured in system** - the data capturer records how many were captured (due by the system reporting time, 15:00 by default).
- Ticking a check with no number counts as zero documents. Entering a number ticks the check.
- Lines whose physical responsible person is `N/A` only have the capture check.
- **Documents not captured** = DC received count minus captured count. Nothing counts as not captured until the DC has confirmed the number received.
- Today's sheet is editable by everyone. Previous days are locked; an admin (or everyone, when no admin code is set) can unlock a day to correct it.

## Pages

| Page | Purpose |
|---|---|
| Daily checks (`/`) | The check sheet. Filter by responsible person, accountable person, category, to-do or exceptions; add comments per check. |
| Exceptions dashboard (`/exceptions`) | Checks not done (by accountable person, then responsible person, then each missed check), count mismatches, documents not yet captured, a graph of all three per working day, and the last 10 working days. |
| Admin (`/admin`) | Add, edit, duplicate or deactivate lines. People are picked from a list to keep names consistent. Edits apply from today onwards; history keeps the details it was checked against. |

## Data

MongoDB database `stock_control_room`:

- `lines` - the checklist lines (the columns of the Excel template).
- `checks` - one record per line per day, with a copy of the line details for that day and the three checks.
- `meta` - a marker so the starting lines are only loaded once.

On first run against an empty database the app loads the 124 lines from the template (`src/lib/seed-lines.json`).

## Configuration

See `.env.example`. Set the same variables in Vercel under Project Settings > Environment Variables.

| Variable | Required | Purpose |
|---|---|---|
| `MONGODB_URI` | yes | Atlas connection string |
| `MONGODB_DB` | no | Database name, defaults to `stock_control_room` |
| `APP_ACCESS_CODE` | recommended | Shared code to open the app |
| `ADMIN_ACCESS_CODE` | recommended | Code for the Admin page and for correcting previous days |

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

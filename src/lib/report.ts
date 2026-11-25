import type { Db } from "mongodb";
import { getDay } from "./data";
import { analyse, stepInfo, summarise } from "./logic";
import { cardText, type TeamsMessage } from "./teams";
import { dueDay, formatDay, formatTime, isWorkingDay, sastDate, sheetsInPlay, windowLabel } from "./time";

/** The scheduled report times (SAST). */
export const REPORT_SLOTS = {
  "10": { hour: 10, title: "10:00 report", note: "Counts for this sheet were due at 10:00 today." },
  "15": { hour: 15, title: "15:00 report", note: "Data capturers had until 15:00 to resolve their issues." },
  "18": { hour: 18, title: "End of day report", note: "The physical team has until the end of today to resolve their issues." },
} as const;
export type ReportSlot = keyof typeof REPORT_SLOTS;

const MAX_ROWS = 12;

type Tone = "Good" | "Attention" | "Warning" | "Default";

/** A big number with a small label underneath, for the row at the top of the card. */
function stat(value: string, label: string, color: Tone) {
  return {
    type: "Column",
    width: "stretch",
    items: [
      { type: "TextBlock", text: value, size: "ExtraLarge", weight: "Bolder", color, spacing: "None" },
      { type: "TextBlock", text: label, size: "Small", isSubtle: true, wrap: true, spacing: "None" },
    ],
  };
}

function heading(text: string) {
  return { type: "TextBlock", text, weight: "Bolder", size: "Medium", spacing: "Large", separator: true, wrap: true };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The report on the sheet due today (yesterday's working day: documents from 06:00 that
 * day until 05:59 today, counts due at 10:00 today), as a Teams card: totals, and who
 * still owes checks (by accountable, then responsible person). Mismatches are counted,
 * with a pointer to the dashboard for the details.
 */
export async function buildReport(
  db: Db,
  title: string,
  note?: string,
  /** A particular sheet, chosen by an admin. Without it: the sheet due today. */
  sheet?: string,
): Promise<TeamsMessage | null> {
  const today = sastDate();
  if (!sheet && !isWorkingDay(today)) return null;
  const now = Date.now();
  const inPlay = sheetsInPlay(now);
  const current = inPlay.current;
  const due = sheet ?? inPlay.due;
  const checks = await getDay(db, due, today);
  const summary = summarise(due, checks, now);
  const done = summary.totalChecks - summary.notDone;

  // Checks not done: accountable person -> responsible person -> counts and DC confirmations.
  // (Count mismatches are only totalled here; the dashboard lists them.)
  const byAccountable = new Map<string, Map<string, { count: number; dc: number }>>();
  for (const check of checks) {
    const a = analyse(check, now);
    for (const step of a.notDone) {
      const info = stepInfo(check.line, step);
      const people = byAccountable.get(info.accountable || "N/A") ?? new Map();
      const entry = people.get(info.responsible || "N/A") ?? { count: 0, dc: 0 };
      if (step === "physical") entry.count += 1;
      else entry.dc += 1;
      people.set(info.responsible || "N/A", entry);
      byAccountable.set(info.accountable || "N/A", people);
    }
  }

  const accountables = [...byAccountable.entries()]
    .map(([name, people]) => ({
      name,
      total: [...people.values()].reduce((n, p) => n + p.count + p.dc, 0),
      people: [...people.entries()].sort((x, y) => y[1].count + y[1].dc - (x[1].count + x[1].dc)),
    }))
    .sort((x, y) => y.total - x.total);

  const blocks: object[] = [
    {
      type: "ColumnSet",
      spacing: "Medium",
      columns: [
        stat(`${done}/${summary.totalChecks}`, `checks done (${summary.totalChecks ? Math.round((done / summary.totalChecks) * 100) : 0}%)`, done === summary.totalChecks ? "Good" : "Default"),
        stat(String(summary.notDone), "checks not done", summary.notDone ? "Attention" : "Good"),
        stat(String(summary.mismatches), summary.mismatches === 1 ? "count mismatch" : "count mismatches", summary.mismatches ? "Attention" : "Good"),
      ],
    },
  ];

  if (accountables.length) {
    blocks.push(heading("Checks not done"));
    // One table with the same columns throughout, so the numbers line up:
    // the accountable person as a bold row with their totals, their responsible people indented below.
    const NUM = "112px";
    const n = (v: number) => (v ? String(v) : "");
    const row = (name: string, counts: string, dc: string, opts: { bold?: boolean; subtle?: boolean; indent?: boolean } = {}) => ({
      type: "ColumnSet",
      spacing: "None",
      columns: [
        ...(opts.indent ? [{ type: "Column", width: "16px", items: [] }] : []),
        {
          type: "Column",
          width: "stretch",
          items: [{ type: "TextBlock", text: name, wrap: true, weight: opts.bold ? "Bolder" : "Default", isSubtle: !!opts.subtle, size: opts.subtle ? "Small" : "Default" }],
        },
        ...[counts, dc].map((value) => ({
          type: "Column",
          width: NUM,
          items: [{ type: "TextBlock", text: value, horizontalAlignment: "Right", weight: opts.bold ? "Bolder" : "Default", isSubtle: !!opts.subtle, size: opts.subtle ? "Small" : "Default" }],
        })),
      ],
    });
    blocks.push(row("Not done by", "Physical count", "System count (DC)", { subtle: true }));
    for (const acc of accountables.slice(0, MAX_ROWS)) {
      const counts = acc.people.reduce((t, [, p]) => t + p.count, 0);
      const dc = acc.people.reduce((t, [, p]) => t + p.dc, 0);
      blocks.push({
        ...row(`${cardText(acc.name, 60)} (accountable)`, n(counts), n(dc), { bold: true }),
        spacing: "Medium",
        separator: true,
      });
      for (const [person, p] of acc.people) blocks.push(row(cardText(person, 60), n(p.count), n(p.dc), { indent: true }));
    }
    if (accountables.length > MAX_ROWS) {
      blocks.push({ type: "TextBlock", text: `...and ${accountables.length - MAX_ROWS} more on the dashboard`, isSubtle: true, wrap: true });
    }
    blocks.push({
      type: "TextBlock",
      text: "Physical count: physical document counts not done. System count (DC): documents the data capturer has not confirmed as received.",
      isSubtle: true,
      size: "Small",
      wrap: true,
      spacing: "Small",
    });
  }

  if (summary.mismatches) {
    blocks.push(heading("Count mismatches"), {
      type: "TextBlock",
      text: `${plural(summary.mismatches, "line has", "lines have")} a System count (DC) that does not match the Physical count, or has no Physical count yet. Open the Exceptions Dashboard to see them.`,
      wrap: true,
      spacing: "Small",
    });
  }

  const time = formatTime(new Date(now).toISOString());
  // How far today's sheet has got, only when reporting on the sheet due today.
  const todays = due === inPlay.due && current !== due ? summarise(current, await getDay(db, current, today), now) : null;
  const allClear = summary.notDone === 0 && summary.mismatches === 0;

  return {
    title: `${title}: ${formatDay(due)} sheet`,
    subtitle: `Documents ${windowLabel(due)}`,
    lines: [],
    blocks,
    note: [
      allClear
        ? "All checks are done and every count matches."
        : (note ?? (due === inPlay.due ? "Counts for this sheet were due at 10:00 today." : `Counts for this sheet were due ${formatDay(dueDay(due), false)} 10:00.`)),
      todays ? `${formatDay(current, false)} sheet: ${todays.totalChecks - todays.notDone} of ${todays.totalChecks} filled in so far.` : "",
      `As at ${time}.`,
    ]
      .filter(Boolean)
      .join(" "),
    buttonTitle: "Open the Exceptions Dashboard",
    path: "/exceptions",
  };
}

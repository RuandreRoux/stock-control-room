import { ObjectId, type Db } from "mongodb";
import seedLines from "./seed-lines.json";
import { sortChecks } from "./logic";
import { isValidTime, isWorkingDay, sastDate } from "./time";
import { LINE_FIELD_KEYS, type DayCheck, type Line, type LineFields, type StepEntry } from "./types";

interface LineDoc extends LineFields {
  _id: ObjectId;
  order: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  deactivatedAt: Date | null;
}

type CheckDoc = DayCheck & { _id?: ObjectId };

const lines = (db: Db) => db.collection<LineDoc>("lines");
const checks = (db: Db) => db.collection<CheckDoc>("checks");

const globalForSetup = globalThis as unknown as { _scrSetup?: Promise<void> };

function isDuplicateKey(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
}

/** Creates indexes and, on a brand new database, loads the lines from the Excel template. */
export function ensureSetup(db: Db): Promise<void> {
  if (!globalForSetup._scrSetup) {
    const run = async () => {
      await checks(db).createIndex({ date: 1, lineId: 1 }, { unique: true });
      const meta = db.collection<{ _id: string; at: Date }>("meta");
      try {
        await meta.insertOne({ _id: "seed", at: new Date() });
      } catch (err) {
        if (isDuplicateKey(err)) return; // already seeded (or another instance is seeding)
        throw err;
      }
      try {
        if ((await lines(db).countDocuments()) === 0) {
          const now = new Date();
          await lines(db).insertMany(
            (seedLines as LineFields[]).map((fields, i) => ({
              _id: new ObjectId(),
              ...fields,
              order: (i + 1) * 10,
              active: true,
              createdAt: now,
              updatedAt: now,
              deactivatedAt: null,
            })),
          );
        }
      } catch (err) {
        await meta.deleteOne({ _id: "seed" });
        throw err;
      }
    };
    const promise = run();
    promise.catch(() => {
      if (globalForSetup._scrSetup === promise) globalForSetup._scrSetup = undefined;
    });
    globalForSetup._scrSetup = promise;
  }
  return globalForSetup._scrSetup;
}

function toLine(doc: LineDoc): Line {
  const fields = Object.fromEntries(LINE_FIELD_KEYS.map((k) => [k, doc[k] ?? ""])) as unknown as LineFields;
  return {
    ...fields,
    id: doc._id.toHexString(),
    order: doc.order,
    active: doc.active,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function snapshot(doc: LineDoc): DayCheck["line"] {
  const fields = Object.fromEntries(LINE_FIELD_KEYS.map((k) => [k, doc[k] ?? ""])) as unknown as LineFields;
  return { ...fields, order: doc.order };
}

const emptyStep = (): StepEntry => ({ checked: false, count: null, comment: "", at: null, by: null });

export async function listLines(db: Db): Promise<Line[]> {
  const docs = await lines(db).find().toArray();
  return docs
    .map(toLine)
    .sort((a, b) => a.category.localeCompare(b.category, undefined, { numeric: true }) || a.order - b.order);
}

/**
 * Returns the check sheet for a day. The first time a day is opened, a record is
 * created per line with a copy of the line details, so later edits to a line on
 * the admin page never rewrite history.
 */
export async function getDay(db: Db, date: string, today: string): Promise<DayCheck[]> {
  // Checks only run on working days (Monday to Friday, excluding public holidays).
  if (date > today || !isWorkingDay(date)) return [];
  const [lineDocs, existing] = await Promise.all([
    lines(db).find().toArray(),
    checks(db).find({ date }, { projection: { _id: 0 } }).toArray(),
  ]);
  const have = new Set(existing.map((c) => c.lineId));
  const missing = lineDocs.filter((l) => {
    if (have.has(l._id.toHexString())) return false;
    if (sastDate(l.createdAt) > date) return false;
    return l.active || (l.deactivatedAt !== null && sastDate(l.deactivatedAt) > date);
  });
  if (missing.length === 0) return sortChecks(existing);

  const fresh: DayCheck[] = missing.map((l) => ({
    date,
    lineId: l._id.toHexString(),
    line: snapshot(l),
    physical: emptyStep(),
    received: emptyStep(),
    captured: emptyStep(),
  }));
  await checks(db).bulkWrite(
    fresh.map((c) => ({
      updateOne: {
        filter: { date: c.date, lineId: c.lineId },
        update: { $setOnInsert: { line: c.line, physical: c.physical, received: c.received, captured: c.captured } },
        upsert: true,
      },
    })),
    { ordered: false },
  );
  // Re-read so that two people opening the day at the same moment see the same thing.
  const all = await checks(db).find({ date }, { projection: { _id: 0 } }).toArray();
  return sortChecks(all);
}

export async function getChecksInRange(db: Db, from: string, to: string): Promise<DayCheck[]> {
  return checks(db)
    .find({ date: { $gte: from, $lte: to } }, { projection: { _id: 0 } })
    .toArray();
}

export interface StepPatch {
  checked?: boolean;
  count?: number | null;
  comment?: string;
}

export async function updateStep(
  db: Db,
  date: string,
  lineId: string,
  step: "physical" | "received" | "captured",
  patch: StepPatch,
  by: string | null,
): Promise<DayCheck | null> {
  const current = await checks(db).findOne({ date, lineId });
  if (!current) return null;
  const set: Record<string, unknown> = {};
  if (patch.comment !== undefined) set[`${step}.comment`] = patch.comment;
  if (patch.checked !== undefined) {
    const entry = current[step];
    set[`${step}.checked`] = patch.checked;
    set[`${step}.count`] = patch.checked ? patch.count ?? 0 : null;
    // Keep the original time so that correcting a count later does not make an on-time check look late.
    set[`${step}.at`] = patch.checked ? (entry.checked && entry.at ? entry.at : new Date().toISOString()) : null;
    set[`${step}.by`] = patch.checked ? by : null;
  }
  const updated =
    Object.keys(set).length === 0
      ? current
      : await checks(db).findOneAndUpdate({ date, lineId }, { $set: set }, { returnDocument: "after" });
  if (!updated) return null;
  const { _id: _unused, ...check } = updated;
  void _unused;
  return check;
}

export function parseLineFields(input: unknown, partial: boolean): { fields: Partial<LineFields> } | { error: string } {
  if (typeof input !== "object" || input === null) return { error: "Invalid line" };
  const src = input as Record<string, unknown>;
  const fields: Partial<LineFields> = {};
  for (const key of LINE_FIELD_KEYS) {
    const raw = src[key];
    if (raw === undefined) {
      if (partial) continue;
      fields[key] = "";
      continue;
    }
    if (typeof raw !== "string") return { error: `${key} must be text` };
    const value = raw.trim();
    if (value.length > 200) return { error: `${key} is too long` };
    fields[key] = value;
  }
  for (const key of ["category", "stockMovement"] as const) {
    if (key in fields && !fields[key]) return { error: "Category and stock movement are required" };
  }
  for (const key of ["physicalReportingTime", "systemReportingTime"] as const) {
    if (key in fields && !isValidTime(fields[key])) return { error: "Reporting times must be a time of day (HH:MM)" };
  }
  return { fields };
}

export async function createLine(db: Db, fields: LineFields): Promise<Line> {
  const last = await lines(db).find().sort({ order: -1 }).limit(1).toArray();
  const now = new Date();
  const doc: LineDoc = {
    _id: new ObjectId(),
    ...fields,
    order: (last[0]?.order ?? 0) + 10,
    active: true,
    createdAt: now,
    updatedAt: now,
    deactivatedAt: null,
  };
  await lines(db).insertOne(doc);
  return toLine(doc);
}

export async function updateLine(
  db: Db,
  id: string,
  fields: Partial<LineFields>,
  active: boolean | undefined,
  today: string,
): Promise<Line | null> {
  if (!ObjectId.isValid(id)) return null;
  const _id = new ObjectId(id);
  const now = new Date();
  const set: Partial<LineDoc> = { ...fields, updatedAt: now };
  if (active !== undefined) {
    set.active = active;
    set.deactivatedAt = active ? null : now;
  }
  const doc = await lines(db).findOneAndUpdate({ _id }, { $set: set }, { returnDocument: "after" });
  if (!doc) return null;

  // Today's sheet follows the change; earlier days keep the details they were checked against.
  if (doc.active) {
    await checks(db).updateOne({ date: today, lineId: id }, { $set: { line: snapshot(doc) } });
  } else {
    await checks(db).deleteOne({
      date: today,
      lineId: id,
      "physical.checked": false,
      "received.checked": false,
      "captured.checked": false,
    });
  }
  return toLine(doc);
}

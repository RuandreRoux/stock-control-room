import { deadlineMs } from "./time";
import type { DayCheck, LineFields, StepKey } from "./types";

export const STEPS: StepKey[] = ["physical", "received", "captured"];

export const STEP_LABEL: Record<StepKey, string> = {
  physical: "Physical count",
  received: "DC received",
  captured: "Captured in system",
};

export function isNA(value: string | null | undefined): boolean {
  const s = (value ?? "").trim().toLowerCase();
  return s === "" || s === "n/a" || s === "na";
}

/**
 * Lines with no physical responsible person (for example system-only temporary
 * adjustments) have nothing to count or hand over: only the capture check applies.
 */
export function applicableSteps(line: LineFields): StepKey[] {
  return isNA(line.responsiblePerson) ? ["captured"] : STEPS;
}

export interface StepInfo {
  responsible: string;
  accountable: string;
  due: string;
  document: string;
}

export function stepInfo(line: LineFields, step: StepKey): StepInfo {
  if (step === "physical") {
    return {
      responsible: line.responsiblePerson,
      accountable: line.physicalAccountablePerson,
      due: line.physicalReportingTime,
      document: line.physicalDocument,
    };
  }
  // The data capturer confirms the hand-over by the physical reporting time, and has
  // until the system reporting time to capture the documents.
  return {
    responsible: line.systemResponsiblePerson,
    accountable: line.systemAccountablePerson,
    due: step === "received" ? line.physicalReportingTime : line.systemReportingTime,
    document: step === "received" ? line.physicalDocument : line.systemDocument,
  };
}

/** The people in a person field. "Hans/Leon" means both Hans and Leon. */
export function namesOf(value: string | null | undefined): string[] {
  if (isNA(value)) return [];
  return (value ?? "")
    .split("/")
    .map((name) => name.trim())
    .filter((name) => !isNA(name));
}

const has = (value: string, person: string) => namesOf(value).includes(person);

/** Whether a line belongs to the selected responsible and/or accountable person (on either side of the sheet). */
export function lineMatches(line: LineFields, responsible: string, accountable: string): boolean {
  if (responsible && !has(line.responsiblePerson, responsible) && !has(line.systemResponsiblePerson, responsible)) {
    return false;
  }
  if (
    accountable &&
    !has(line.physicalAccountablePerson, accountable) &&
    !has(line.systemAccountablePerson, accountable)
  ) {
    return false;
  }
  return true;
}

/** Whether one check on a line belongs to the selected responsible and/or accountable person. */
export function stepMatches(line: LineFields, step: StepKey, responsible: string, accountable: string): boolean {
  const info = stepInfo(line, step);
  return (!responsible || has(info.responsible, responsible)) && (!accountable || has(info.accountable, accountable));
}

export type RowStatus = "todo" | "progress" | "balanced" | "mismatch" | "outstanding" | "over";

export interface StepState {
  applicable: boolean;
  done: boolean;
  /** Not done and past its reporting time. */
  overdue: boolean;
  /** Done, but after its reporting time. */
  late: boolean;
}

export interface Analysis {
  steps: Record<StepKey, StepState>;
  notDone: StepKey[];
  /** Responsible count and DC received count are both in and differ. */
  mismatch: boolean;
  /** DC received minus responsible count (when both are in). */
  diff: number | null;
  /** Documents the data capturer has to capture: DC received count, else the responsible count. */
  expected: number | null;
  capturedCount: number;
  /** expected - captured. Positive: still to capture. Negative: over-captured. */
  outstanding: number | null;
  status: RowStatus;
}

export function analyse(check: DayCheck, nowMs: number): Analysis {
  const applicable = applicableSteps(check.line);
  const steps = {} as Record<StepKey, StepState>;
  for (const step of STEPS) {
    const entry = check[step];
    const isApplicable = applicable.includes(step);
    const due = deadlineMs(check.date, stepInfo(check.line, step).due);
    steps[step] = {
      applicable: isApplicable,
      done: isApplicable && entry.checked,
      overdue: isApplicable && !entry.checked && nowMs > due,
      late: isApplicable && entry.checked && !!entry.at && new Date(entry.at).getTime() > due,
    };
  }
  const notDone = applicable.filter((s) => !steps[s].done);

  const physical = steps.physical.done ? check.physical.count ?? 0 : null;
  const received = steps.received.done ? check.received.count ?? 0 : null;
  const capturedCount = steps.captured.done ? check.captured.count ?? 0 : 0;

  const mismatch = physical !== null && received !== null && physical !== received;
  const diff = physical !== null && received !== null ? received - physical : null;
  const expected = received ?? physical;
  const outstanding = expected === null ? null : expected - capturedCount;

  let status: RowStatus;
  if (mismatch) status = "mismatch";
  else if (steps.captured.done && outstanding !== null && outstanding > 0) status = "outstanding";
  else if (steps.captured.done && outstanding !== null && outstanding < 0) status = "over";
  else if (notDone.length === 0) status = "balanced";
  else if (notDone.length === applicable.length) status = "todo";
  else status = "progress";

  return { steps, notDone, mismatch, diff, expected, capturedCount, outstanding, status };
}

export interface DaySummary {
  date: string;
  lines: number;
  totalChecks: number;
  notDone: number;
  overdue: number;
  mismatches: number;
  /** Total documents still to be captured across all lines. */
  outstandingDocs: number;
  outstandingLines: number;
}

export function summarise(date: string, checks: DayCheck[], nowMs: number): DaySummary {
  const s: DaySummary = {
    date,
    lines: checks.length,
    totalChecks: 0,
    notDone: 0,
    overdue: 0,
    mismatches: 0,
    outstandingDocs: 0,
    outstandingLines: 0,
  };
  for (const check of checks) {
    const a = analyse(check, nowMs);
    for (const step of STEPS) {
      if (!a.steps[step].applicable) continue;
      s.totalChecks += 1;
      if (!a.steps[step].done) s.notDone += 1;
      if (a.steps[step].overdue) s.overdue += 1;
    }
    if (a.mismatch) s.mismatches += 1;
    if (a.outstanding !== null && a.outstanding > 0) {
      s.outstandingDocs += a.outstanding;
      s.outstandingLines += 1;
    }
  }
  return s;
}

export function sortChecks(checks: DayCheck[]): DayCheck[] {
  return [...checks].sort(
    (a, b) =>
      a.line.category.localeCompare(b.line.category, undefined, { numeric: true }) ||
      a.line.order - b.line.order,
  );
}

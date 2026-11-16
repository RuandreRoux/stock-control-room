"use client";

import { AlertCircle, AlertTriangle, CheckCircle2, ChevronDown, Clock } from "lucide-react";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { DateNav } from "@/components/DateNav";
import { api, useCheckDate, useDay } from "@/lib/client";
import { analyse, STEP_LABEL, stepInfo, summarise, type DaySummary } from "@/lib/logic";
import { formatDay } from "@/lib/time";
import type { DayCheck, StepKey } from "@/lib/types";

type Tab = "notDone" | "mismatch" | "outstanding";

interface NotDoneItem {
  check: DayCheck;
  step: StepKey;
  responsible: string;
  accountable: string;
  due: string;
  overdue: boolean;
}

interface NotDoneGroup {
  key: string;
  responsible: string;
  accountable: string;
  step: StepKey;
  items: NotDoneItem[];
  overdue: number;
}

const th = "caps px-4 py-2 text-left font-semibold";
const td = "px-4 py-2.5 align-top";
const num = "px-4 py-2.5 align-top text-right tabular-nums";

function Movement({ check }: { check: DayCheck }) {
  return (
    <>
      <p className="font-semibold text-ink-900">{check.line.stockMovement}</p>
      <p className="text-[12px] text-ink-600">
        {check.line.fromWarehouse || "N/A"} to {check.line.toWarehouse || "N/A"}
      </p>
    </>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center justify-center gap-2 px-4 py-10 text-ink-600">
      <CheckCircle2 size={18} strokeWidth={1.75} className="text-brand" aria-hidden />
      {children}
    </p>
  );
}

export default function ExceptionsPage() {
  const { date, today, setDate } = useCheckDate();
  const { data, error } = useDay(date, "");
  const [tab, setTab] = useState<Tab>("notDone");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [recent, setRecent] = useState<DaySummary[] | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => setExpanded(new Set()), [date]);

  const checks = data?.checks;

  useEffect(() => {
    let cancelled = false;
    api<{ days: DaySummary[] }>(`/api/summary?to=${today}&days=14`)
      .then((r) => !cancelled && setRecent(r.days))
      .catch(() => !cancelled && setRecent([]));
    return () => {
      cancelled = true;
    };
    // Refresh the history whenever the selected day's data changes.
  }, [today, checks]);

  const report = useMemo(() => {
    if (!checks) return null;
    const summary = summarise(date, checks, now);
    const groups = new Map<string, NotDoneGroup>();
    const mismatches: { check: DayCheck; physical: number; received: number; diff: number }[] = [];
    const outstanding: { check: DayCheck; expected: number; captured: number; outstanding: number }[] = [];

    for (const check of checks) {
      const a = analyse(check, now);
      for (const step of a.notDone) {
        const info = stepInfo(check.line, step);
        const key = `${info.responsible}|${info.accountable}|${step}`;
        let group = groups.get(key);
        if (!group) {
          group = { key, responsible: info.responsible, accountable: info.accountable, step, items: [], overdue: 0 };
          groups.set(key, group);
        }
        const overdue = a.steps[step].overdue;
        group.items.push({ check, step, responsible: info.responsible, accountable: info.accountable, due: info.due, overdue });
        if (overdue) group.overdue += 1;
      }
      if (a.mismatch) {
        mismatches.push({
          check,
          physical: check.physical.count ?? 0,
          received: check.received.count ?? 0,
          diff: a.diff ?? 0,
        });
      }
      if (a.outstanding !== null && a.outstanding !== 0 && (a.outstanding > 0 || a.steps.captured.done)) {
        outstanding.push({ check, expected: a.expected ?? 0, captured: a.capturedCount, outstanding: a.outstanding });
      }
    }
    const notDone = [...groups.values()].sort(
      (x, y) => y.items.length - x.items.length || x.responsible.localeCompare(y.responsible),
    );
    outstanding.sort((x, y) => y.outstanding - x.outstanding);
    return { summary, notDone, mismatches, outstanding };
  }, [checks, date, now]);

  const tiles: { tab: Tab; label: string; value: number; detail: string }[] = report
    ? [
        {
          tab: "notDone",
          label: "Checks not done",
          value: report.summary.notDone,
          detail: `of ${report.summary.totalChecks} checks - ${report.summary.overdue} overdue`,
        },
        {
          tab: "mismatch",
          label: "Count mismatches",
          value: report.summary.mismatches,
          detail: "lines where the responsible and DC counts differ",
        },
        {
          tab: "outstanding",
          label: "Documents not yet captured",
          value: report.summary.outstandingDocs,
          detail: `across ${report.summary.outstandingLines} ${report.summary.outstandingLines === 1 ? "line" : "lines"}`,
        },
      ]
    : [];

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-[-0.01em] text-ink-900">Exception Report</h1>
          <p className="mt-1 max-w-xl text-[13px] text-ink-600">
            What still needs attention for the day. Select a tile to see the lines behind the number.
          </p>
        </div>
        <DateNav date={date} today={today} onChange={setDate} />
      </div>

      {error && (
        <div role="alert" className="mt-4 flex items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-[13px]">
          <AlertCircle size={16} strokeWidth={1.75} className="flex-none text-danger" aria-hidden />
          {error}
        </div>
      )}
      {!data && !error && <p className="card mt-4 px-4 py-10 text-center text-ink-600">Loading the report...</p>}

      {report && data && data.checks.length === 0 && (
        <p className="card mt-4 px-4 py-10 text-center text-ink-600">
          There is no check sheet for this day. Checks are recorded from the day the app went live.
        </p>
      )}

      {report && data && data.checks.length > 0 && (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-3" role="tablist" aria-label="Exceptions">
            {tiles.map((tile) => {
              const selected = tab === tile.tab;
              const clear = tile.value === 0;
              return (
                <button
                  key={tile.tab}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setTab(tile.tab)}
                  className={`card px-4 py-4 text-left transition-[border-color,box-shadow] duration-200 hover:shadow-lift ${
                    selected ? "border-brand shadow-[inset_0_-3px_0_var(--color-lime)]" : ""
                  }`}
                >
                  <p className="caps">{tile.label}</p>
                  <p className="mt-1 font-display text-[34px] font-bold leading-tight text-ink-900 tabular-nums">
                    {tile.value}
                  </p>
                  <p className="text-[12px] text-ink-600">{tile.detail}</p>
                  <p className="mt-2 flex items-center gap-1 text-[12px] font-semibold text-ink-800">
                    {clear ? (
                      <CheckCircle2 size={14} strokeWidth={1.75} className="text-brand" aria-hidden />
                    ) : (
                      <AlertTriangle size={14} strokeWidth={1.75} className="text-danger" aria-hidden />
                    )}
                    {clear ? "All clear" : "Needs attention"}
                  </p>
                </button>
              );
            })}
          </div>

          <section className="card mt-3 overflow-hidden" role="tabpanel">
            {tab === "notDone" && (
              <>
                <header className="border-b border-ink-100 px-4 py-3">
                  <h2 className="font-display text-base font-bold text-ink-900">Checks not done</h2>
                  <p className="text-[12px] text-ink-600">
                    Grouped by who is responsible and accountable. Select a row to see the lines.
                  </p>
                </header>
                {report.notDone.length === 0 ? (
                  <Empty>Every check has been done for this day.</Empty>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-[13px]">
                      <thead className="bg-ink-50">
                        <tr>
                          <th className={th}>Responsible</th>
                          <th className={th}>Accountable</th>
                          <th className={th}>Check</th>
                          <th className={`${th} text-right`}>Not done</th>
                          <th className={`${th} text-right`}>Overdue</th>
                          <th className="w-10" />
                        </tr>
                      </thead>
                      <tbody>
                        {report.notDone.map((group) => {
                          const isOpen = expanded.has(group.key);
                          return (
                            <Fragment key={group.key}>
                              <tr
                                className="cursor-pointer border-t border-ink-100 hover:bg-brand-50"
                                onClick={() =>
                                  setExpanded((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(group.key)) next.delete(group.key);
                                    else next.add(group.key);
                                    return next;
                                  })
                                }
                              >
                                <td className={`${td} font-semibold text-ink-900`}>{group.responsible || "N/A"}</td>
                                <td className={td}>{group.accountable || "N/A"}</td>
                                <td className={td}>{STEP_LABEL[group.step]}</td>
                                <td className={`${num} font-semibold text-ink-900`}>{group.items.length}</td>
                                <td className={num}>
                                  {group.overdue > 0 ? (
                                    <span className="inline-flex items-center gap-1 font-semibold text-ink-900">
                                      <AlertCircle size={14} strokeWidth={1.75} className="text-danger" aria-hidden />
                                      {group.overdue}
                                    </span>
                                  ) : (
                                    <span className="text-ink-400">0</span>
                                  )}
                                </td>
                                <td className="px-2 py-2.5">
                                  <button
                                    type="button"
                                    aria-expanded={isOpen}
                                    aria-label={`${isOpen ? "Hide" : "Show"} lines for ${group.responsible}, ${STEP_LABEL[group.step]}`}
                                    className="flex h-7 w-7 items-center justify-center rounded-sm text-ink-600"
                                  >
                                    <ChevronDown
                                      size={16}
                                      strokeWidth={1.75}
                                      className={isOpen ? "rotate-180" : ""}
                                      aria-hidden
                                    />
                                  </button>
                                </td>
                              </tr>
                              {isOpen &&
                                group.items.map((item) => (
                                  <tr key={`${item.check.lineId}-${item.step}`} className="border-t border-ink-100 bg-ink-50">
                                    <td className={`${td} pl-8`} colSpan={3}>
                                      <Movement check={item.check} />
                                    </td>
                                    <td className={`${td} text-right text-[12px] text-ink-600`} colSpan={3}>
                                      {item.overdue ? (
                                        <span className="inline-flex items-center gap-1 font-semibold text-ink-800">
                                          <AlertCircle size={14} strokeWidth={1.75} className="text-danger" aria-hidden />
                                          Overdue - was due {item.due}
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1">
                                          <Clock size={14} strokeWidth={1.75} className="text-ink-400" aria-hidden />
                                          Due by {item.due}
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {tab === "mismatch" && (
              <>
                <header className="border-b border-ink-100 px-4 py-3">
                  <h2 className="font-display text-base font-bold text-ink-900">Count mismatches</h2>
                  <p className="text-[12px] text-ink-600">
                    The responsible person and the data capturer counted a different number of documents.
                  </p>
                </header>
                {report.mismatches.length === 0 ? (
                  <Empty>No mismatches between the responsible and DC counts.</Empty>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-[13px]">
                      <thead className="bg-ink-50">
                        <tr>
                          <th className={th}>Stock movement</th>
                          <th className={th}>Responsible</th>
                          <th className={`${th} text-right`}>Completed</th>
                          <th className={th}>Data capturer</th>
                          <th className={`${th} text-right`}>Received</th>
                          <th className={`${th} text-right`}>Difference</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.mismatches.map(({ check, physical, received, diff }) => (
                          <tr key={check.lineId} className="border-t border-ink-100">
                            <td className={td}>
                              <Movement check={check} />
                              {[check.physical.comment, check.received.comment].filter(Boolean).map((c, i) => (
                                <p key={i} className="mt-1 text-[12px] italic text-ink-600">
                                  &ldquo;{c}&rdquo;
                                </p>
                              ))}
                            </td>
                            <td className={td}>
                              {check.line.responsiblePerson}
                              <span className="block text-[12px] text-ink-600">
                                Accountable: {check.line.physicalAccountablePerson || "N/A"}
                              </span>
                            </td>
                            <td className={num}>{physical}</td>
                            <td className={td}>
                              {check.line.systemResponsiblePerson}
                              <span className="block text-[12px] text-ink-600">
                                Accountable: {check.line.systemAccountablePerson || "N/A"}
                              </span>
                            </td>
                            <td className={num}>{received}</td>
                            <td className={`${num} font-semibold text-ink-900`}>
                              {diff > 0 ? `+${diff}` : diff}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {tab === "outstanding" && (
              <>
                <header className="border-b border-ink-100 px-4 py-3">
                  <h2 className="font-display text-base font-bold text-ink-900">Documents not yet captured</h2>
                  <p className="text-[12px] text-ink-600">
                    Documents handed to the data capturer that are not yet captured in the system. Where the DC has not
                    confirmed a count yet, the responsible person&rsquo;s count is used.
                  </p>
                </header>
                {report.outstanding.length === 0 ? (
                  <Empty>Every counted document has been captured.</Empty>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-[13px]">
                      <thead className="bg-ink-50">
                        <tr>
                          <th className={th}>Stock movement</th>
                          <th className={th}>System document</th>
                          <th className={th}>Data capturer</th>
                          <th className={`${th} text-right`}>To capture</th>
                          <th className={`${th} text-right`}>Captured</th>
                          <th className={`${th} text-right`}>Outstanding</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.outstanding.map(({ check, expected, captured, outstanding }) => (
                          <tr key={check.lineId} className="border-t border-ink-100">
                            <td className={td}>
                              <Movement check={check} />
                              {check.captured.comment && (
                                <p className="mt-1 text-[12px] italic text-ink-600">&ldquo;{check.captured.comment}&rdquo;</p>
                              )}
                            </td>
                            <td className={td}>{check.line.systemDocument || "N/A"}</td>
                            <td className={td}>
                              {check.line.systemResponsiblePerson}
                              <span className="block text-[12px] text-ink-600">
                                Accountable: {check.line.systemAccountablePerson || "N/A"}
                              </span>
                            </td>
                            <td className={num}>{expected}</td>
                            <td className={num}>{captured}</td>
                            <td className={`${num} font-semibold text-ink-900`}>
                              {outstanding > 0 ? outstanding : `Over by ${Math.abs(outstanding)}`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </section>
        </>
      )}

      <section className="card mt-6 overflow-hidden">
        <header className="border-b border-ink-100 px-4 py-3">
          <h2 className="font-display text-base font-bold text-ink-900">Last 14 Days</h2>
          <p className="text-[12px] text-ink-600">Select a day to open its report.</p>
        </header>
        {recent === null ? (
          <p className="px-4 py-6 text-center text-ink-600">Loading...</p>
        ) : recent.length === 0 ? (
          <p className="px-4 py-6 text-center text-ink-600">No days recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[13px]">
              <thead className="bg-ink-50">
                <tr>
                  <th className={th}>Day</th>
                  <th className={`${th} text-right`}>Checks not done</th>
                  <th className={`${th} text-right`}>Count mismatches</th>
                  <th className={`${th} text-right`}>Documents not captured</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((day) => (
                  <tr key={day.date} className={`border-t border-ink-100 ${day.date === date ? "bg-brand-50" : ""}`}>
                    <td className={td}>
                      <Link
                        href={day.date === today ? "/exceptions" : `/exceptions?date=${day.date}`}
                        scroll={false}
                        className="font-semibold text-brand underline-offset-2 hover:text-sea hover:underline"
                      >
                        {formatDay(day.date)}
                      </Link>
                      {day.date === today && <span className="ml-2 text-[12px] text-ink-600">today</span>}
                    </td>
                    <td className={num}>
                      {day.notDone} <span className="text-ink-400">of {day.totalChecks}</span>
                    </td>
                    <td className={num}>{day.mismatches}</td>
                    <td className={num}>{day.outstandingDocs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

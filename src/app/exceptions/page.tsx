"use client";

import { AlertCircle, AlertTriangle, CheckCircle2, ChevronDown, Clock } from "lucide-react";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { DateNav } from "@/components/DateNav";
import { SERIES, TrendChart } from "@/components/TrendChart";
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

/** Checks not done, grouped by accountable person, then by responsible person. */
interface ResponsibleGroup {
  responsible: string;
  items: NotDoneItem[];
  overdue: number;
}

interface AccountableGroup {
  accountable: string;
  total: number;
  overdue: number;
  responsibles: ResponsibleGroup[];
}

const th = "caps px-4 py-2 text-left font-semibold";
const td = "px-4 py-2.5 align-top";
const num = "px-4 py-2.5 align-top text-right tabular-nums";

/** Stock movement, From and To as three separate cells. */
function LineCells({ check, children }: { check: DayCheck; children?: React.ReactNode }) {
  return (
    <>
      <td className={td}>
        <p className="font-semibold text-ink-900">{check.line.stockMovement}</p>
        {children}
      </td>
      <td className={td}>{check.line.fromWarehouse || "N/A"}</td>
      <td className={td}>{check.line.toWarehouse || "N/A"}</td>
    </>
  );
}

const group = "caps border-l border-ink-200 px-4 pt-2 text-left font-semibold";

function OverdueCount({ n }: { n: number }) {
  if (n === 0) return <span className="text-ink-400">0</span>;
  return (
    <span className="inline-flex items-center gap-1 font-semibold text-ink-900">
      <AlertCircle size={14} strokeWidth={1.75} className="text-danger" aria-hidden />
      {n}
    </span>
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
  const { date, today, latest, setDate } = useCheckDate();
  const { data, error } = useDay(date, "");
  const [tab, setTab] = useState<Tab>("notDone");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Exception totals for recent working days, newest first: the graph and the table below share it.
  const [history, setHistory] = useState<DaySummary[] | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => setExpanded(new Set()), [date]);

  const checks = data?.checks;
  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  useEffect(() => {
    let cancelled = false;
    api<{ days: DaySummary[] }>(`/api/summary?to=${today}&days=45`)
      .then((r) => !cancelled && setHistory(r.days))
      .catch(() => !cancelled && setHistory([]));
    return () => {
      cancelled = true;
    };
    // Refresh the history whenever the selected day's data changes.
  }, [today, checks]);

  const report = useMemo(() => {
    if (!checks) return null;
    const summary = summarise(date, checks, now);
    const groups = new Map<string, Map<string, ResponsibleGroup>>();
    const mismatches: { check: DayCheck; physical: number; received: number; diff: number }[] = [];
    const outstanding: { check: DayCheck; expected: number; captured: number; outstanding: number }[] = [];

    for (const check of checks) {
      const a = analyse(check, now);
      for (const step of a.notDone) {
        const info = stepInfo(check.line, step);
        const accountable = info.accountable || "N/A";
        const responsible = info.responsible || "N/A";
        let byResponsible = groups.get(accountable);
        if (!byResponsible) {
          byResponsible = new Map();
          groups.set(accountable, byResponsible);
        }
        let group = byResponsible.get(responsible);
        if (!group) {
          group = { responsible, items: [], overdue: 0 };
          byResponsible.set(responsible, group);
        }
        const overdue = a.steps[step].overdue;
        group.items.push({ check, step, responsible, accountable, due: info.due, overdue });
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
    const notDone: AccountableGroup[] = [...groups.entries()]
      .map(([accountable, byResponsible]) => {
        const responsibles = [...byResponsible.values()].sort(
          (x, y) => y.items.length - x.items.length || x.responsible.localeCompare(y.responsible),
        );
        return {
          accountable,
          responsibles,
          total: responsibles.reduce((n, r) => n + r.items.length, 0),
          overdue: responsibles.reduce((n, r) => n + r.overdue, 0),
        };
      })
      .sort((x, y) => y.total - x.total || x.accountable.localeCompare(y.accountable));
    outstanding.sort((x, y) => y.outstanding - x.outstanding);
    return { summary, notDone, mismatches, outstanding };
  }, [checks, date, now]);

  const recent = history?.slice(0, 10) ?? null;
  const trend = useMemo(() => (history ?? []).slice(0, 20).reverse(), [history]);

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
          detail: `documents received by the DC, across ${report.summary.outstandingLines} ${report.summary.outstandingLines === 1 ? "line" : "lines"}`,
        },
      ]
    : [];

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-[-0.01em] text-ink-900">Exceptions Dashboard</h1>
          <p className="mt-1 max-w-xl text-[13px] text-ink-600">
            What still needs attention for the day. Select a tile to see the lines behind the number.
          </p>
        </div>
        <DateNav date={date} today={today} latest={latest} onChange={setDate} />
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
          <div className="mt-4 grid gap-3 xl:grid-cols-[340px_minmax(0,1fr)]">
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1" role="tablist" aria-label="Exceptions">
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
                  <p className="caps flex items-center gap-2">
                    <span
                      className="h-[3px] w-4 flex-none rounded-full"
                      style={{ background: SERIES[tiles.indexOf(tile)].color }}
                      aria-hidden
                    />
                    {tile.label}
                  </p>
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

          {/* Two graphs: checks are counted in the hundreds, documents in ones and tens. */}
          <div className="grid min-w-0 gap-3">
            {(
              [
                {
                  title: "Checks Not Done per Day",
                  hint: "Tick boxes that were never ticked.",
                  series: ["notDone"],
                },
                {
                  title: "Count Mismatches and Documents Not Captured per Day",
                  hint: "Select a name to hide that line and rescale the other.",
                  series: ["mismatches", "outstandingDocs"],
                },
              ] as const
            ).map((graph) => (
              <section key={graph.title} className="card min-w-0 px-4 py-3" aria-label={graph.title}>
                <h2 className="font-display text-base font-bold text-ink-900">{graph.title}</h2>
                <p className="mb-2 text-[12px] text-ink-600">
                  Last {trend.length} working {trend.length === 1 ? "day" : "days"}. {graph.hint} Click a day to open
                  it.
                </p>
                {history === null ? (
                  <p className="py-10 text-center text-ink-600">Loading the graph...</p>
                ) : (
                  <TrendChart
                    days={trend}
                    series={[...graph.series]}
                    selected={date}
                    today={today}
                    height={graph.series.length > 1 ? 180 : 170}
                    onSelect={setDate}
                  />
                )}
              </section>
            ))}
          </div>
          </div>

          <section className="card mt-3 overflow-hidden" role="tabpanel">
            {tab === "notDone" && (
              <>
                <header className="border-b border-ink-100 px-4 py-3">
                  <h2 className="font-display text-base font-bold text-ink-900">Checks not done</h2>
                  <p className="text-[12px] text-ink-600">
                    Grouped by accountable person. Open a person to see who is responsible, then open a responsible
                    person to see each check that was missed.
                  </p>
                </header>
                {report.notDone.length === 0 ? (
                  <Empty>Every check has been done for this day.</Empty>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-[13px]">
                      <thead className="bg-ink-50">
                        <tr>
                          <th className={th}>Accountable / Responsible</th>
                          <th className={`${th} w-32 text-right`}>Not done</th>
                          <th className={`${th} w-32 text-right`}>Overdue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.notDone.map((acc) => {
                          const accOpen = expanded.has(acc.accountable);
                          return (
                            <Fragment key={acc.accountable}>
                              <tr
                                className="cursor-pointer border-t border-ink-200 bg-white hover:bg-brand-50"
                                onClick={() => toggle(acc.accountable)}
                              >
                                <td className={td}>
                                  <button
                                    type="button"
                                    aria-expanded={accOpen}
                                    className="flex items-center gap-2 text-left font-display text-[14px] font-bold text-ink-900"
                                  >
                                    <ChevronDown
                                      size={16}
                                      strokeWidth={1.75}
                                      className={`flex-none text-brand ${accOpen ? "" : "-rotate-90"}`}
                                      aria-hidden
                                    />
                                    {acc.accountable}
                                    <span className="font-body text-[12px] font-normal text-ink-600">
                                      accountable - {acc.responsibles.length} responsible{" "}
                                      {acc.responsibles.length === 1 ? "person" : "people"}
                                    </span>
                                  </button>
                                </td>
                                <td className={`${num} font-display text-[14px] font-bold text-ink-900`}>{acc.total}</td>
                                <td className={num}>
                                  <OverdueCount n={acc.overdue} />
                                </td>
                              </tr>
                              {accOpen &&
                                acc.responsibles.map((resp) => {
                                  const key = `${acc.accountable}|${resp.responsible}`;
                                  const respOpen = expanded.has(key);
                                  return (
                                    <Fragment key={key}>
                                      <tr
                                        className="cursor-pointer border-t border-ink-100 bg-ink-50 hover:bg-brand-50"
                                        onClick={() => toggle(key)}
                                      >
                                        <td className={`${td} pl-10`}>
                                          <button
                                            type="button"
                                            aria-expanded={respOpen}
                                            className="flex items-center gap-2 text-left font-semibold text-ink-900"
                                          >
                                            <ChevronDown
                                              size={16}
                                              strokeWidth={1.75}
                                              className={`flex-none text-ink-600 ${respOpen ? "" : "-rotate-90"}`}
                                              aria-hidden
                                            />
                                            {resp.responsible}
                                            <span className="text-[12px] font-normal text-ink-600">responsible</span>
                                          </button>
                                        </td>
                                        <td className={`${num} font-semibold text-ink-900`}>{resp.items.length}</td>
                                        <td className={num}>
                                          <OverdueCount n={resp.overdue} />
                                        </td>
                                      </tr>
                                      {respOpen && (
                                        <tr className="border-t border-ink-100 bg-ink-50">
                                          <td colSpan={3} className="pb-3 pl-16 pr-4 pt-1">
                                            <table className="w-full rounded-lg bg-white text-[13px]">
                                              <thead>
                                                <tr>
                                                  {["Stock movement", "From WH", "To WH", "Check", "Due"].map((h) => (
                                                    <th key={h} className="caps px-3 py-1.5 text-left font-semibold">
                                                      {h}
                                                    </th>
                                                  ))}
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {resp.items.map((item) => (
                                                  <tr
                                                    key={`${item.check.lineId}-${item.step}`}
                                                    className="border-t border-ink-100 align-top"
                                                  >
                                                    <td className="px-3 py-1.5 font-semibold text-ink-900">
                                                      {item.check.line.stockMovement}
                                                    </td>
                                                    <td className="px-3 py-1.5">{item.check.line.fromWarehouse || "N/A"}</td>
                                                    <td className="px-3 py-1.5">{item.check.line.toWarehouse || "N/A"}</td>
                                                    <td className="whitespace-nowrap px-3 py-1.5">{STEP_LABEL[item.step]}</td>
                                                    <td className="whitespace-nowrap px-3 py-1.5">
                                                      {item.overdue ? (
                                                        <span className="inline-flex items-center gap-1 font-semibold text-ink-900">
                                                          <AlertCircle
                                                            size={14}
                                                            strokeWidth={1.75}
                                                            className="text-danger"
                                                            aria-hidden
                                                          />
                                                          Overdue - was due {item.due}
                                                        </span>
                                                      ) : (
                                                        <span className="inline-flex items-center gap-1 text-ink-600">
                                                          <Clock size={14} strokeWidth={1.75} className="text-ink-400" aria-hidden />
                                                          Due by {item.due}
                                                        </span>
                                                      )}
                                                    </td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </td>
                                        </tr>
                                      )}
                                    </Fragment>
                                  );
                                })}
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
                    <table className="w-full min-w-[1100px] text-[13px]">
                      <thead className="bg-ink-50">
                        <tr>
                          <th colSpan={3} />
                          <th colSpan={3} className={group}>
                            Physical count
                          </th>
                          <th colSpan={3} className={group}>
                            DC received
                          </th>
                          <th />
                        </tr>
                        <tr>
                          <th className={th}>Stock movement</th>
                          <th className={th}>From WH</th>
                          <th className={th}>To WH</th>
                          <th className={`${th} border-l border-ink-200`}>Responsible</th>
                          <th className={th}>Accountable</th>
                          <th className={`${th} text-right`}>Completed</th>
                          <th className={`${th} border-l border-ink-200`}>Responsible</th>
                          <th className={th}>Accountable</th>
                          <th className={`${th} text-right`}>Received</th>
                          <th className={`${th} border-l border-ink-200 text-right`}>Difference</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.mismatches.map(({ check, physical, received, diff }) => (
                          <tr key={check.lineId} className="border-t border-ink-100">
                            <LineCells check={check}>
                              {[check.physical.comment, check.received.comment].filter(Boolean).map((c, i) => (
                                <p key={i} className="mt-1 text-[12px] font-normal italic text-ink-600">
                                  &ldquo;{c}&rdquo;
                                </p>
                              ))}
                            </LineCells>
                            <td className={`${td} border-l border-ink-100 font-semibold text-ink-900`}>
                              {check.line.responsiblePerson || "N/A"}
                            </td>
                            <td className={td}>{check.line.physicalAccountablePerson || "N/A"}</td>
                            <td className={num}>{physical}</td>
                            <td className={`${td} border-l border-ink-100 font-semibold text-ink-900`}>
                              {check.line.systemResponsiblePerson || "N/A"}
                            </td>
                            <td className={td}>{check.line.systemAccountablePerson || "N/A"}</td>
                            <td className={num}>{received}</td>
                            <td className={`${num} border-l border-ink-100 font-semibold text-ink-900`}>
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
                    Documents the data capturer has confirmed receiving that are not yet captured in the system
                    (DC received count minus captured count).
                  </p>
                </header>
                {report.outstanding.length === 0 ? (
                  <Empty>Every counted document has been captured.</Empty>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1100px] text-[13px]">
                      <thead className="bg-ink-50">
                        <tr>
                          <th className={th}>Stock movement</th>
                          <th className={th}>From WH</th>
                          <th className={th}>To WH</th>
                          <th className={th}>System document</th>
                          <th className={th}>Responsible</th>
                          <th className={th}>Accountable</th>
                          <th className={`${th} text-right`}>DC received</th>
                          <th className={`${th} text-right`}>Captured</th>
                          <th className={`${th} text-right`}>Outstanding</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.outstanding.map(({ check, expected, captured, outstanding }) => (
                          <tr key={check.lineId} className="border-t border-ink-100">
                            <LineCells check={check}>
                              {check.captured.comment && (
                                <p className="mt-1 text-[12px] font-normal italic text-ink-600">
                                  &ldquo;{check.captured.comment}&rdquo;
                                </p>
                              )}
                            </LineCells>
                            <td className={td}>{check.line.systemDocument || "N/A"}</td>
                            <td className={`${td} font-semibold text-ink-900`}>
                              {check.line.systemResponsiblePerson || "N/A"}
                            </td>
                            <td className={td}>{check.line.systemAccountablePerson || "N/A"}</td>
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
          <h2 className="font-display text-base font-bold text-ink-900">Last 10 Working Days</h2>
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
                        href={day.date === latest ? "/exceptions" : `/exceptions?date=${day.date}`}
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

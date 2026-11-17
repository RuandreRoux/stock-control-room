"use client";

import { AlertTriangle, CalendarDays, CheckCircle2, Clock, PencilLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import type { DaySummary } from "@/lib/logic";
import { dueDay, formatDay, sheetPhase, sheetsInPlay, windowLabel, type SheetPhase } from "@/lib/time";
import { DateNav } from "./DateNav";

export type SheetKind = "current" | "due" | "older";

export function sheetKind(date: string, nowMs = Date.now()): SheetKind {
  const { current, due } = sheetsInPlay(nowMs);
  return date === current ? "current" : date === due ? "due" : "older";
}

/** Colours per kind of sheet, used by the cards, the bar and the switch message. */
export const KIND_STYLE: Record<SheetKind, { bar: string; ring: string; chip: string; label: string }> = {
  current: { bar: "bg-brand text-white", ring: "border-brand", chip: "bg-brand text-white", label: "Filling in now" },
  due: { bar: "bg-warn text-ink-900", ring: "border-warn", chip: "bg-warn text-ink-900", label: "Due today" },
  older: { bar: "bg-ink-800 text-white", ring: "border-ink-800", chip: "bg-ink-800 text-white", label: "Earlier sheet" },
};

const PHASE_TEXT: Record<SheetPhase, string> = {
  collecting: "Collecting documents",
  countsDue: "Counts due by 10:00 today",
  resolving: "Resolve issues: data capturers by 15:00",
  lastChance: "Resolve remaining issues today",
  closed: "Earlier sheet",
};

function StatusLine({ summary, phase, kind }: { summary?: DaySummary; phase: SheetPhase; kind: SheetKind }) {
  if (kind === "current") {
    return (
      <p className="flex items-start gap-1.5 text-[13px] text-ink-800">
        <PencilLine size={15} strokeWidth={1.75} className="mt-0.5 flex-none text-brand" aria-hidden />
        <span>
          Fill in as documents come in.
          {summary ? ` ${summary.totalChecks - summary.notDone} of ${summary.totalChecks} done so far.` : ""}
        </span>
      </p>
    );
  }
  if (!summary) return <p className="text-[13px] text-ink-600">Not opened yet.</p>;
  const issues = summary.notDone + summary.mismatches;
  if (issues === 0) {
    return (
      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-800">
        <CheckCircle2 size={15} strokeWidth={1.75} className="flex-none text-brand" aria-hidden />
        All done and every count matches
      </p>
    );
  }
  return (
    <p className="flex items-start gap-1.5 text-[13px] font-semibold text-ink-900">
      {phase === "countsDue" ? (
        <Clock size={15} strokeWidth={1.75} className="mt-0.5 flex-none text-warn" aria-hidden />
      ) : (
        <AlertTriangle size={15} strokeWidth={1.75} className="mt-0.5 flex-none text-danger" aria-hidden />
      )}
      <span>
        {summary.notDone} not done{summary.mismatches ? `, ${summary.mismatches} count mismatch${summary.mismatches === 1 ? "" : "es"}` : ""}
      </span>
    </p>
  );
}

/**
 * Makes it unmistakable which day's sheet is open: the two sheets in play as large cards,
 * a coloured bar that stays on screen while scrolling, and a message on every switch.
 */
export function SheetPicker({
  date,
  today,
  latest,
  onChange,
  live,
}: {
  date: string;
  today: string;
  latest: string;
  onChange: (d: string) => void;
  /** Up-to-date totals for the sheet on screen, worked out by the page. */
  live?: DaySummary;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [summaries, setSummaries] = useState<Record<string, DaySummary>>({});
  const [flash, setFlash] = useState<string | null>(null);
  const first = useRef(true);
  const { current, due } = sheetsInPlay(now);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api<{ days: DaySummary[] }>(`/api/summary?to=${latest}&days=10`)
        .then((res) => !cancelled && setSummaries(Object.fromEntries(res.days.map((d) => [d.date, d]))))
        .catch(() => {});
    load();
    const timer = window.setInterval(() => {
      setNow(Date.now());
      load();
    }, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [latest]);

  // Announce every switch of sheet clearly.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setFlash(date);
    const timer = window.setTimeout(() => setFlash(null), 4500);
    return () => window.clearTimeout(timer);
  }, [date]);

  const kind = sheetKind(date, now);
  const style = KIND_STYLE[kind];
  const summaryFor = (d: string) => (d === date && live ? live : summaries[d]);

  const card = (d: string, k: SheetKind) => {
    const selected = d === date;
    const s = KIND_STYLE[k];
    const phase = sheetPhase(d, now);
    return (
      <button
        key={d}
        type="button"
        aria-pressed={selected}
        onClick={() => onChange(d)}
        className={`card relative flex min-w-0 flex-col gap-1 border-2 px-4 py-3 text-left transition-[box-shadow,border-color] duration-200 hover:shadow-lift ${
          selected ? `${s.ring} shadow-lift` : "border-ink-100"
        }`}
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 font-display text-[11px] font-bold uppercase tracking-[0.06em] ${s.chip}`}>
            {k === "due" ? PHASE_TEXT[phase] : s.label}
          </span>
          {selected && (
            <span className="rounded-full border border-ink-800 px-2 py-0.5 font-display text-[11px] font-bold uppercase tracking-[0.06em] text-ink-900">
              You are here
            </span>
          )}
        </span>
        <span className="font-display text-[22px] font-bold leading-tight text-ink-900">{formatDay(d)} sheet</span>
        <span className="text-[12px] text-ink-600">
          Documents {windowLabel(d)}. Counts due {formatDay(dueDay(d), false)} 10:00.
        </span>
        <StatusLine summary={summaryFor(d)} phase={phase} kind={k} />
      </button>
    );
  };

  return (
    <>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {due < current && card(due, "due")}
        {card(current, "current")}
      </div>

      {kind === "older" && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border-2 border-ink-800 bg-white px-4 py-3">
          <CalendarDays size={20} strokeWidth={1.75} className="flex-none text-ink-800" aria-hidden />
          <p className="min-w-0 flex-1 text-[14px] text-ink-900">
            <strong>You are on an earlier sheet: {formatDay(date)}.</strong> Documents {windowLabel(date)}. Changes you
            make are saved to this earlier day.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => onChange(current)}>
            Back to {formatDay(current, false)}
          </button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-ink-600">
        <span className="caps">Another day</span>
        <DateNav date={date} today={today} latest={latest} onChange={onChange} compact />
      </div>

      {/* Always on screen while scrolling: the sheet being changed. */}
      <div className={`sticky top-14 z-20 -mx-4 mt-4 px-4 py-2 shadow-card ${style.bar}`} role="status" aria-live="polite">
        <p className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
          <span className="font-display text-[15px] font-bold uppercase tracking-[0.04em]">
            Working on: {formatDay(date)} sheet
          </span>
          <span className="opacity-90">documents {windowLabel(date)}</span>
          <span className="ml-auto font-semibold">{style.label}</span>
        </p>
      </div>

      {flash && (
        <div className="pointer-events-none fixed inset-x-0 top-20 z-50 flex justify-center px-4" role="alert">
          <div className={`rise-in rounded-xl px-6 py-4 text-center shadow-modal ${KIND_STYLE[sheetKind(flash, now)].bar}`}>
            <p className="font-display text-[12px] font-bold uppercase tracking-[0.08em] opacity-90">Switched sheet</p>
            <p className="font-display text-[22px] font-bold leading-tight">{formatDay(flash)} sheet</p>
            <p className="text-[13px] opacity-90">Documents {windowLabel(flash)}</p>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import { AlertCircle, ChevronDown, Lock, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CheckRow, HEADER_GRID } from "@/components/CheckRow";
import { Loading } from "@/components/Brand";
import { DateNav } from "@/components/DateNav";
import { useCheckDate, useDay, useStored, type StepChange } from "@/lib/client";
import { analyse, lineMatches, namesOf, STEP_LABEL, STEPS, stepMatches, type Analysis } from "@/lib/logic";
import type { DayCheck, StepKey } from "@/lib/types";

type Show = "all" | "todo" | "exceptions";

const SHOW_OPTIONS: { value: Show; label: string }[] = [
  { value: "all", label: "All" },
  { value: "todo", label: "To do" },
  { value: "exceptions", label: "Exceptions" },
];

export default function DailyChecksPage() {
  const { date, today, latest, setDate } = useCheckDate();
  const [responsible, setResponsible] = useStored("scr.responsible");
  const [accountable, setAccountable] = useStored("scr.accountable");
  const { data, error, saveState, saveError, update } = useDay(date, responsible || accountable);

  const [category, setCategory] = useState("");
  const [show, setShow] = useState<Show>("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // Lines edited since the filter was last changed stay on screen, so a row does not
  // jump away the moment its last box is ticked.
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => Date.now());
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    setTouched(new Set());
  }, [date, responsible, accountable, category, show, search]);
  useEffect(() => {
    setOpen(new Set());
    setUnlocked(false);
  }, [date]);

  const checks = data?.checks;
  // Previous days stay locked until someone deliberately unlocks them, so the record is not changed by accident.
  const isPast = date < today;
  const mayEdit = data?.canEdit ?? false;
  const canEdit = mayEdit && (!isPast || unlocked);

  // Two separate lists: who does the checks, and who answers for them.
  const { responsibles, accountables } = useMemo(() => {
    const r = new Set<string>();
    const acc = new Set<string>();
    for (const c of checks ?? []) {
      namesOf(c.line.responsiblePerson).forEach((n) => r.add(n));
      namesOf(c.line.systemResponsiblePerson).forEach((n) => r.add(n));
      namesOf(c.line.physicalAccountablePerson).forEach((n) => acc.add(n));
      namesOf(c.line.systemAccountablePerson).forEach((n) => acc.add(n));
    }
    const sorted = (set: Set<string>) => [...set].sort((x, y) => x.localeCompare(y));
    return { responsibles: sorted(r), accountables: sorted(acc) };
  }, [checks]);

  // A remembered name that no longer exists (for example after a rename) is dropped.
  useEffect(() => {
    if (!checks || checks.length === 0) return;
    if (responsible && !responsibles.includes(responsible)) setResponsible("");
    if (accountable && !accountables.includes(accountable)) setAccountable("");
  }, [checks, responsible, accountable, responsibles, accountables, setResponsible, setAccountable]);

  const categories = useMemo(() => [...new Set((checks ?? []).map((c) => c.line.category))], [checks]);

  const analysed = useMemo(() => {
    const map = new Map<string, Analysis>();
    for (const c of checks ?? []) map.set(c.lineId, analyse(c, now));
    return map;
  }, [checks, now]);

  const mine = useMemo(
    () => (checks ?? []).filter((c) => lineMatches(c.line, responsible, accountable)),
    [checks, responsible, accountable],
  );

  const progress = useMemo(
    () =>
      STEPS.map((step) => {
        let total = 0;
        let done = 0;
        let overdue = 0;
        for (const c of mine) {
          const state = analysed.get(c.lineId)!.steps[step];
          if (!state.applicable) continue;
          total += 1;
          if (state.done) done += 1;
          if (state.overdue) overdue += 1;
        }
        return { step, total, done, overdue };
      }),
    [mine, analysed],
  );

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const visible = mine.filter((c) => {
      if (category && c.line.category !== category) return false;
      if (term) {
        const haystack = [
          c.line.stockMovement,
          c.line.fromWarehouse,
          c.line.toWarehouse,
          c.line.physicalDocument,
          c.line.systemDocument,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      if (show === "all" || touched.has(c.lineId)) return true;
      const a = analysed.get(c.lineId)!;
      if (show === "todo") {
        // With a person selected, "to do" means the checks that person still owes.
        return a.notDone.some((step) => stepMatches(c.line, step, responsible, accountable));
      }
      return (
        a.status === "mismatch" ||
        a.status === "outstanding" ||
        a.status === "over" ||
        STEPS.some((s) => a.steps[s].overdue)
      );
    });
    const byCategory = new Map<string, DayCheck[]>();
    for (const c of visible) {
      const list = byCategory.get(c.line.category);
      if (list) list.push(c);
      else byCategory.set(c.line.category, [c]);
    }
    return [...byCategory.entries()];
  }, [mine, category, search, show, touched, analysed, responsible, accountable]);

  const visibleCount = groups.reduce((n, [, list]) => n + list.length, 0);

  const onChange = (lineId: string, step: StepKey, change: StepChange) => {
    setTouched((prev) => (prev.has(lineId) ? prev : new Set(prev).add(lineId)));
    update(lineId, step, change);
  };
  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-[-0.01em] text-ink-900">Daily Checks</h1>
          <p className="mt-1 max-w-xl text-[13px] text-ink-600">
            Tick each check once it is done and enter the number of documents. A tick with no number counts as zero
            documents.
          </p>
        </div>
        <DateNav date={date} today={today} latest={latest} onChange={setDate} />
      </div>

      {data && isPast && (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-ink-200 bg-white px-4 py-3 text-[13px] text-ink-800">
          <Lock size={16} strokeWidth={1.75} className="flex-none text-ink-600" aria-hidden />
          <span className="min-w-0 flex-1">
            {canEdit
              ? "This previous day is unlocked. Changes you make are saved to the record."
              : mayEdit
                ? "You are reviewing a previous day. Entries are locked to protect the record."
                : "You are reviewing a previous day. Entries are read-only; an admin can correct them after signing in on the Admin page."}
          </span>
          {mayEdit && (
            <button type="button" className="btn btn-ghost" onClick={() => setUnlocked((v) => !v)}>
              {unlocked ? "Lock again" : "Unlock to edit"}
            </button>
          )}
        </div>
      )}
      {(error || saveError) && (
        <div
          role="alert"
          className="mt-4 flex items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-[13px] text-ink-800"
        >
          <AlertCircle size={16} strokeWidth={1.75} className="flex-none text-danger" aria-hidden />
          {saveError ? `Your last change was not saved: ${saveError}` : error}
        </div>
      )}

      <section aria-label="Progress" className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
        {progress.map(({ step, total, done, overdue }) => (
          <div key={step} className="card px-3 py-3 sm:px-4">
            <div className="flex flex-col justify-between gap-x-2 sm:flex-row sm:items-baseline">
              <p className="caps">{STEP_LABEL[step]}</p>
              <p className="text-[13px] text-ink-600">
                <span className="font-display text-base font-bold text-ink-900">{done}</span> of {total}
              </p>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-100" aria-hidden>
              <div
                className="h-full rounded-full bg-brand transition-[width] duration-300"
                style={{ width: total ? `${(done / total) * 100}%` : "0%" }}
              />
            </div>
            <p className="mt-2 flex min-h-5 items-center gap-1 text-[12px] leading-tight text-ink-600">
              {overdue > 0 ? (
                <>
                  <AlertCircle size={14} strokeWidth={1.75} className="text-danger" aria-hidden />
                  <span className="font-semibold text-ink-800">{overdue} overdue</span>
                </>
              ) : total > 0 && done === total ? (
                "All done"
              ) : (
                `${total - done} still to do`
              )}
            </p>
          </div>
        ))}
      </section>

      <section aria-label="Filters" className="mt-4 flex flex-wrap items-end gap-3">
        <label className="w-[calc(50%-6px)] sm:w-48">
          <span className="caps mb-1 block">Responsible</span>
          <select className="input" value={responsible} onChange={(e) => setResponsible(e.target.value)}>
            <option value="">Everyone</option>
            {responsibles.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="w-[calc(50%-6px)] sm:w-48">
          <span className="caps mb-1 block">Accountable</span>
          <select className="input" value={accountable} onChange={(e) => setAccountable(e.target.value)}>
            <option value="">Everyone</option>
            {accountables.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="w-full sm:w-48">
          <span className="caps mb-1 block">Category</span>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <div>
          <span className="caps mb-1 block">View</span>
          <div className="inline-flex rounded-sm border border-ink-200 bg-white p-0.5" role="group" aria-label="View">
            {SHOW_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                aria-pressed={show === o.value}
                onClick={() => setShow(o.value)}
                className={`h-8 rounded-sm px-3 font-display text-[12px] font-semibold uppercase tracking-[0.05em] transition-colors duration-200 ${
                  show === o.value ? "bg-brand text-white" : "text-ink-600 hover:bg-brand-50 hover:text-brand"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <label className="relative w-full sm:ml-auto sm:w-56">
          <span className="sr-only">Search lines</span>
          <Search
            size={16}
            strokeWidth={1.75}
            className="pointer-events-none absolute left-3 top-2.5 text-ink-400"
            aria-hidden
          />
          <input
            type="search"
            className="input pl-9"
            placeholder="Search lines"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </section>

      <div className="mt-2 flex h-5 items-center justify-between text-[12px] text-ink-600">
        <span>{data ? `${visibleCount} of ${data.checks.length} lines` : ""}</span>
        <span aria-live="polite">
          {saveState === "saving" ? "Saving..." : saveState === "saved" ? "All changes saved" : ""}
        </span>
      </div>

      {!data && !error && <Loading label="Loading the check sheet" />}

      {data && data.checks.length === 0 && (
        <p className="card mt-2 px-4 py-10 text-center text-ink-600">
          There is no check sheet for this day. Checks are recorded from the day the app went live.
        </p>
      )}

      {data && data.checks.length > 0 && visibleCount === 0 && (
        <p className="card mt-2 px-4 py-10 text-center text-ink-600">
          {show === "todo" ? "Nothing left to do for this selection." : "No lines match this selection."}
        </p>
      )}

      {groups.map(([name, list]) => {
        const isCollapsed = collapsed.has(name);
        const complete = list.filter((c) => analysed.get(c.lineId)!.notDone.length === 0).length;
        return (
          <section key={name} className="card mt-2 overflow-hidden">
            <button
              type="button"
              aria-expanded={!isCollapsed}
              onClick={() => setCollapsed((prev) => toggle(prev, name))}
              className="flex w-full items-center gap-3 bg-brand-50 px-4 py-2.5 text-left"
            >
              <ChevronDown
                size={18}
                strokeWidth={1.75}
                className={`flex-none text-brand ${isCollapsed ? "-rotate-90" : ""}`}
                aria-hidden
              />
              <h2 className="font-display text-[14px] font-bold text-ink-900">{name}</h2>
              <span className="ml-auto text-[12px] text-ink-600">
                {complete} of {list.length} lines complete
              </span>
            </button>
            {!isCollapsed && (
              <>
                <div className={`border-t border-ink-100 bg-ink-50 px-4 py-2 ${HEADER_GRID}`} aria-hidden>
                  <span className="caps">Stock movement</span>
                  <span className="caps">From WH</span>
                  <span className="caps">To WH</span>
                  {STEPS.map((s) => (
                    <span key={s} className="caps">
                      {STEP_LABEL[s]}
                    </span>
                  ))}
                  <span className="caps">Status</span>
                  <span />
                </div>
                <ul className="border-t border-ink-100">
                  {list.map((c) => (
                    <CheckRow
                      key={c.lineId}
                      check={c}
                      a={analysed.get(c.lineId)!}
                      canEdit={canEdit}
                      responsible={responsible}
                      accountable={accountable}
                      open={open.has(c.lineId)}
                      onToggle={() => setOpen((prev) => toggle(prev, c.lineId))}
                      onChange={(step, change) => onChange(c.lineId, step, change)}
                    />
                  ))}
                </ul>
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}

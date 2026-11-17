"use client";

import { AlertCircle, AlertTriangle, CheckCircle2, ChevronDown, Clock, MessageSquare } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { StepChange } from "@/lib/client";
import { isNA, STEP_LABEL, STEPS, stepInfo, stepMatches, type Analysis } from "@/lib/logic";
import { formatTime } from "@/lib/time";
import type { DayCheck, StepKey } from "@/lib/types";
import { StatusPill } from "./StatusPill";

/**
 * Phone: everything stacked. Tablet: movement / from / to on one line, the two checks
 * side by side below. Wide screens: one row per line, one column per item.
 */
const WIDE_COLS =
  "wide:grid-cols-[minmax(0,1.15fr)_minmax(0,0.95fr)_minmax(0,0.95fr)_repeat(2,minmax(0,1.6fr))_156px_36px] wide:gap-x-3";
export const ROW_GRID = `md:grid md:grid-cols-6 md:gap-x-3 md:gap-y-3 wide:items-start ${WIDE_COLS}`;
/** Column headings, only shown when a line fits on one row. */
export const HEADER_GRID = `hidden wide:grid ${WIDE_COLS}`;
const CELL = "md:col-span-2 wide:col-span-1";
const STEP_CELL = "md:col-span-3 wide:col-span-1";

function CountInput({
  value,
  disabled,
  label,
  onCommit,
}: {
  value: number | null;
  disabled: boolean;
  label: string;
  onCommit: (n: number | null) => void;
}) {
  const [draft, setDraft] = useState(value === null ? "" : String(value));
  const focused = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!focused.current) setDraft(value === null ? "" : String(value));
  }, [value]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const commit = (text: string) => {
    window.clearTimeout(timer.current);
    const next = text === "" ? null : Number(text);
    if (next !== value) onCommit(next);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      aria-label={label}
      placeholder="-"
      className="input h-9 w-16 flex-none px-2 text-center text-[15px] font-semibold tabular-nums"
      disabled={disabled}
      value={draft}
      onFocus={(e) => {
        focused.current = true;
        e.target.select();
      }}
      onChange={(e) => {
        const text = e.target.value.replace(/\D/g, "").slice(0, 5);
        setDraft(text);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => commit(text), 900);
      }}
      onBlur={() => {
        focused.current = false;
        commit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

function CommentBox({
  value,
  disabled,
  label,
  onCommit,
}: {
  value: string;
  disabled: boolean;
  label: string;
  onCommit: (text: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);
  return (
    <textarea
      rows={2}
      maxLength={1000}
      aria-label={label}
      placeholder={disabled ? "No comment" : "Add a comment"}
      className="input resize-y text-[13px]"
      disabled={disabled}
      value={draft}
      onFocus={() => (focused.current = true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        focused.current = false;
        if (draft.trim() !== value) onCommit(draft.trim());
      }}
    />
  );
}

function Place({ label, value }: { label: string; value: string }) {
  const none = isNA(value);
  return (
    <div className={`mt-2 min-w-0 md:mt-0 ${CELL}`}>
      <p className="caps wide:hidden">{label}</p>
      <p className={`text-[13px] leading-snug ${none ? "text-ink-400" : "text-ink-800"}`}>{none ? "N/A" : value}</p>
    </div>
  );
}

/** Responsible and accountable are always shown as two separate, labelled names. */
function People({ responsible, accountable }: { responsible: string; accountable: string }) {
  return (
    <dl className="mt-2 grid grid-cols-2 gap-x-2 border-t border-ink-900/10 pt-1.5">
      <div className="min-w-0">
        <dt className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-600">Responsible</dt>
        <dd className="break-words text-[13px] font-semibold leading-snug text-ink-900">{responsible || "N/A"}</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-600">Accountable</dt>
        <dd className="break-words text-[13px] leading-snug text-ink-800">{accountable || "N/A"}</dd>
      </div>
    </dl>
  );
}

export function CheckRow({
  check,
  a,
  canEdit,
  responsible,
  accountable,
  open,
  onToggle,
  onChange,
}: {
  check: DayCheck;
  a: Analysis;
  canEdit: boolean;
  responsible: string;
  accountable: string;
  open: boolean;
  onToggle: () => void;
  onChange: (step: StepKey, change: StepChange) => void;
}) {
  const { line } = check;
  const comments = STEPS.filter((s) => check[s].comment).length + (check.reason ? 1 : 0);

  return (
    <li className="border-t border-ink-100 px-4 py-3 first:border-t-0">
      <div className={ROW_GRID}>
        <div className={`min-w-0 ${CELL}`}>
          <p className="caps wide:hidden">Stock movement</p>
          <p className="font-display text-[13px] font-semibold leading-snug text-ink-900">{line.stockMovement}</p>
        </div>
        <Place label="From WH" value={line.fromWarehouse} />
        <Place label="To WH" value={line.toWarehouse} />

        {STEPS.map((step) => {
          const info = stepInfo(line, step);
          const state = a.steps[step];
          const entry = check[step];
          if (!state.applicable) {
            return (
              <div
                key={step}
                className={`mt-3 rounded-lg border border-dashed border-ink-200 px-3 py-2 text-[12px] text-ink-400 md:mt-0 ${STEP_CELL}`}
              >
                <span className="caps mr-2 wide:hidden">{STEP_LABEL[step]}</span>
                Not applicable
              </div>
            );
          }
          const mine = stepMatches(line, step, responsible, accountable);
          const mismatch = a.mismatch;

          // Colour tells the state at a glance; the line of text under the count says it in words.
          let tone = "border-ink-200 bg-white";
          let note = (
            <>
              <Clock size={13} strokeWidth={1.75} className="flex-none text-ink-400" aria-hidden />
              <span>Due {info.due}</span>
            </>
          );
          if (mismatch) {
            tone = "border-danger/50 bg-danger/10";
            note = (
              <>
                <AlertTriangle size={13} strokeWidth={1.75} className="flex-none text-danger" aria-hidden />
                <span className="font-semibold text-ink-900">Counts differ</span>
              </>
            );
          } else if (state.done) {
            tone = "border-brand/30 bg-brand-100";
            note = (
              <>
                <CheckCircle2 size={13} strokeWidth={1.75} className="flex-none text-brand" aria-hidden />
                <span>
                  Done{entry.at ? ` ${formatTime(entry.at)}` : ""}
                  {state.late ? " - late" : ""}
                </span>
              </>
            );
          } else if (state.overdue) {
            tone = "border-danger/50 bg-danger/10";
            note = (
              <>
                <AlertCircle size={13} strokeWidth={1.75} className="flex-none text-danger" aria-hidden />
                <span className="font-semibold text-ink-900">Overdue - due {info.due}</span>
              </>
            );
          }

          return (
            <div
              key={step}
              className={`mt-3 min-w-0 rounded-lg border px-3 py-2 md:mt-0 ${STEP_CELL} ${tone} ${mine ? "" : "opacity-55"}`}
            >
              <p className="caps mb-1 wide:hidden">{STEP_LABEL[step]}</p>
              <p className="mb-1.5 line-clamp-2 text-[12px] font-semibold leading-snug text-ink-800" title={info.document}>
                {step === "received" ? "Documents received" : info.document || "No document"}
                {step === "received" && !isNA(line.systemDocument) && (
                  <span className="font-normal text-ink-600"> - for {line.systemDocument}</span>
                )}
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="check"
                  aria-label={`${STEP_LABEL[step]} done - ${line.stockMovement}`}
                  checked={entry.checked}
                  disabled={!canEdit}
                  onChange={(e) =>
                    onChange(step, e.target.checked ? { checked: true, count: entry.count ?? 0 } : { checked: false })
                  }
                />
                <CountInput
                  value={entry.count}
                  disabled={!canEdit}
                  label={`${STEP_LABEL[step]} document count - ${line.stockMovement}`}
                  onCommit={(n) => onChange(step, n === null ? { checked: false } : { checked: true, count: n })}
                />
                <p className="flex min-w-0 flex-1 items-start gap-1 text-[12px] leading-snug text-ink-600 [&>svg]:mt-0.5">
                  {note}
                </p>
              </div>
              <People responsible={info.responsible} accountable={info.accountable} />
            </div>
          );
        })}

        <div className="mt-3 md:col-span-5 md:mt-0 wide:col-span-1 wide:pt-2">
          <StatusPill a={a} />
        </div>

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={`${open ? "Hide" : "Show"} comments - ${line.stockMovement}`}
          title={open ? "Hide comments" : "Comments"}
          className={`mt-3 inline-flex h-9 items-center gap-1 justify-self-end rounded-sm px-2 text-[12px] font-semibold transition-colors duration-200 hover:bg-brand-50 md:mt-0 wide:w-9 wide:justify-center wide:px-0 ${
            comments ? "text-brand" : "text-ink-600"
          }`}
        >
          {open ? (
            <ChevronDown size={18} strokeWidth={1.75} className="rotate-180" aria-hidden />
          ) : (
            <span className="relative">
              <MessageSquare size={18} strokeWidth={1.75} aria-hidden />
              {comments > 0 && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-lime" />}
            </span>
          )}
          <span className="wide:hidden">{open ? "Hide" : comments ? `Comments (${comments})` : "Comment"}</span>
        </button>
      </div>

      {open && (
        <div className="mt-3 rounded-lg bg-ink-50 p-3">
          <p className="text-[12px] text-ink-600">
            <span className="font-semibold text-ink-800">Category:</span> {line.category}
            {line.source && (
              <>
                <span className="mx-2 text-ink-200">|</span>
                <span className="font-semibold text-ink-800">Source:</span> {line.source}
              </>
            )}
          </p>
          {check.reason && (
            <p className="mt-2 rounded-sm border-l-2 border-danger bg-white px-3 py-2 text-[13px] text-ink-900">
              <span className="font-semibold">Reason for the mismatch:</span> {check.reason.text}
              <span className="text-ink-600"> ({check.reason.by ?? "someone"})</span>
            </p>
          )}
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            {STEPS.filter((step) => a.steps[step].applicable).map((step) => {
              const entry = check[step];
              return (
                <div key={step} className="min-w-0">
                  <p className="caps mb-1">{STEP_LABEL[step]} comment</p>
                  <CommentBox
                    value={entry.comment}
                    disabled={!canEdit}
                    label={`${STEP_LABEL[step]} comment - ${line.stockMovement}`}
                    onCommit={(text) => onChange(step, { comment: text })}
                  />
                  {entry.checked && entry.at && (
                    <p className="mt-1 text-[12px] leading-snug text-ink-600">
                      Checked {formatTime(entry.at)}
                      {entry.by ? ` by ${entry.by}` : ""}
                      {a.steps[step].late ? " - after the reporting time" : ""}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </li>
  );
}

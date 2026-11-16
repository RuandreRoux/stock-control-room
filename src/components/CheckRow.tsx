"use client";

import { AlertCircle, ArrowRight, ChevronDown, MessageSquare } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { StepChange } from "@/lib/client";
import { STEP_LABEL, STEPS, stepInfo, type Analysis } from "@/lib/logic";
import { formatTime } from "@/lib/time";
import type { DayCheck, StepKey } from "@/lib/types";
import { StatusPill } from "./StatusPill";

export const ROW_GRID =
  "lg:grid lg:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))_168px_36px] lg:items-start lg:gap-x-4";

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
      className="input h-9 w-16 px-2 text-center font-semibold tabular-nums"
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

export function CheckRow({
  check,
  a,
  canEdit,
  person,
  open,
  onToggle,
  onChange,
}: {
  check: DayCheck;
  a: Analysis;
  canEdit: boolean;
  person: string;
  open: boolean;
  onToggle: () => void;
  onChange: (step: StepKey, change: StepChange) => void;
}) {
  const { line } = check;
  const comments = STEPS.filter((s) => check[s].comment).length;

  return (
    <li className="border-t border-ink-100 px-4 py-3 first:border-t-0">
      <div className={ROW_GRID}>
        <div className="min-w-0">
          <p className="font-display text-[13px] font-semibold leading-snug text-ink-900">{line.stockMovement}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] leading-snug text-ink-600">
            <span>{line.fromWarehouse || "N/A"}</span>
            <ArrowRight size={12} strokeWidth={1.75} className="flex-none text-ink-400" aria-label="to" />
            <span>{line.toWarehouse || "N/A"}</span>
          </p>
        </div>

        {STEPS.map((step) => {
          const info = stepInfo(line, step);
          const state = a.steps[step];
          const entry = check[step];
          const mine = !person || info.responsible === person;
          if (!state.applicable) {
            return (
              <div key={step} className="mt-3 text-[12px] text-ink-400 lg:mt-0 lg:pt-2">
                <span className="caps mr-2 lg:hidden">{STEP_LABEL[step]}</span>
                Not applicable
              </div>
            );
          }
          return (
            <div key={step} className={`mt-3 min-w-0 lg:mt-0 ${mine ? "" : "opacity-60"}`}>
              <p className="caps mb-1 lg:hidden">{STEP_LABEL[step]}</p>
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
                {state.overdue && (
                  <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-800">
                    <AlertCircle size={14} strokeWidth={1.75} className="text-danger" aria-hidden />
                    Overdue
                  </span>
                )}
              </div>
              <p className="mt-1 truncate text-[12px] leading-snug text-ink-600" title={info.document}>
                {step === "received" ? "Documents handed over" : info.document || "No document"}
              </p>
              <p className="truncate text-[12px] leading-snug text-ink-400">
                {info.responsible} - by {info.due}
              </p>
            </div>
          );
        })}

        <div className="mt-3 lg:mt-0 lg:pt-1.5">
          <StatusPill a={a} />
        </div>

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={`${open ? "Hide" : "Show"} comments and details - ${line.stockMovement}`}
          className={`mt-3 inline-flex h-9 items-center gap-1 rounded-sm px-2 text-[12px] font-semibold transition-colors duration-200 hover:bg-brand-50 lg:mt-0 lg:w-9 lg:justify-center lg:px-0 ${
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
          <span className="lg:hidden">{open ? "Hide details" : comments ? `Comments (${comments})` : "Comment"}</span>
        </button>
      </div>

      {open && (
        <div className={`mt-3 rounded-lg bg-ink-50 p-3 ${ROW_GRID}`}>
          <dl className="space-y-1 text-[12px] text-ink-600">
            <div>
              <dt className="inline font-semibold text-ink-800">Category: </dt>
              <dd className="inline">{line.category}</dd>
            </div>
            {line.source && (
              <div>
                <dt className="inline font-semibold text-ink-800">Source: </dt>
                <dd className="inline">{line.source}</dd>
              </div>
            )}
          </dl>
          {STEPS.map((step) => {
            const info = stepInfo(line, step);
            const state = a.steps[step];
            const entry = check[step];
            if (!state.applicable) return <div key={step} />;
            return (
              <div key={step} className="mt-3 min-w-0 lg:mt-0">
                <p className="caps mb-1">{STEP_LABEL[step]} comment</p>
                <CommentBox
                  value={entry.comment}
                  disabled={!canEdit}
                  label={`${STEP_LABEL[step]} comment - ${line.stockMovement}`}
                  onCommit={(text) => onChange(step, { comment: text })}
                />
                <p className="mt-1 text-[12px] leading-snug text-ink-600">Accountable: {info.accountable || "N/A"}</p>
                {entry.checked && entry.at && (
                  <p className="text-[12px] leading-snug text-ink-600">
                    Checked {formatTime(entry.at)}
                    {entry.by ? ` by ${entry.by}` : ""}
                    {state.late ? " - after the reporting time" : ""}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </li>
  );
}

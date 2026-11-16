"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DaySummary } from "@/lib/logic";
import { formatDay } from "@/lib/time";

export type SeriesKey = "notDone" | "mismatches" | "outstandingDocs";

/**
 * One colour per measure, used for the lines here and for the keys on the tiles.
 * Checked as a set for colour-blind separation and contrast on a white card.
 */
export const SERIES: { key: SeriesKey; label: string; color: string }[] = [
  { key: "notDone", label: "Checks not done", color: "#2a78d6" },
  { key: "mismatches", label: "Count mismatches", color: "#eb6834" },
  { key: "outstandingDocs", label: "Documents not captured", color: "#006838" },
];

const HEIGHT = 300;
const PAD = { top: 16, right: 20, bottom: 30, left: 44 };

/** A rounded axis maximum and about four even steps up to it. */
function axis(max: number): { top: number; ticks: number[] } {
  if (max <= 4) return { top: 4, ticks: [0, 1, 2, 3, 4] };
  const rough = max / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough && Number.isInteger(s)) ?? 10 * pow;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return { top, ticks };
}

/**
 * The three exception counts per working day on one shared axis. Hover (or use the
 * arrow keys) to read a day; click a day to open its report. Legend items hide a line,
 * which rescales the graph so the smaller counts can be read.
 */
export function TrendChart({
  days,
  selected,
  today,
  onSelect,
}: {
  /** Oldest first. */
  days: DaySummary[];
  selected: string;
  today: string;
  onSelect: (date: string) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hidden, setHidden] = useState<Set<SeriesKey>>(new Set());
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => setActive(null), [days.length]);

  const visible = SERIES.filter((s) => !hidden.has(s.key));
  const { top, ticks } = useMemo(
    () => axis(Math.max(0, ...days.flatMap((d) => visible.map((s) => d[s.key])))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [days, hidden],
  );

  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (days.length <= 1 ? innerW / 2 : (i / (days.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH;
  // Show as many day labels as fit without touching.
  const labelEvery = Math.max(1, Math.ceil(days.length / Math.max(1, Math.floor(innerW / 64))));

  const nearest = (clientX: number) => {
    const rect = wrap.current?.getBoundingClientRect();
    if (!rect || days.length === 0) return null;
    if (days.length === 1) return 0;
    const ratio = (clientX - rect.left - PAD.left) / innerW;
    return Math.min(days.length - 1, Math.max(0, Math.round(ratio * (days.length - 1))));
  };

  const toggle = (key: SeriesKey) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else if (next.size < SERIES.length - 1) next.add(key); // always keep one line
      return next;
    });

  const day = active !== null ? days[active] : null;
  const tipLeft = active !== null ? x(active) : 0;
  const tipOnLeft = tipLeft > width * 0.6;

  return (
    <div>
      <div className="flex flex-wrap gap-x-2 gap-y-1" role="group" aria-label="Lines shown">
        {SERIES.map((s) => {
          const on = !hidden.has(s.key);
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={on}
              title={on ? "Hide this line" : "Show this line"}
              onClick={() => toggle(s.key)}
              className={`inline-flex h-7 items-center gap-2 rounded-full border px-2.5 text-[12px] font-semibold transition-colors duration-200 ${
                on ? "border-ink-200 bg-white text-ink-800" : "border-ink-100 bg-ink-50 text-ink-400 line-through"
              }`}
            >
              <span
                className="h-[3px] w-4 rounded-full"
                style={{ background: on ? s.color : "var(--color-ink-200)" }}
                aria-hidden
              />
              {s.label}
            </button>
          );
        })}
      </div>

      <div
        ref={wrap}
        className="relative mt-2 cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-brand"
        style={{ height: HEIGHT }}
        tabIndex={0}
        role="img"
        aria-label={`Exceptions per working day for the last ${days.length} working days. Use the arrow keys to read a day and Enter to open it. The same numbers are in the table below.`}
        onPointerMove={(e) => setActive(nearest(e.clientX))}
        onPointerLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
        onClick={(e) => {
          const i = nearest(e.clientX);
          if (i !== null) onSelect(days[i].date);
        }}
        onKeyDown={(e) => {
          if (days.length === 0) return;
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            // The first key press lands on the latest day; after that the arrows step day by day.
            const next = active === null ? days.length - 1 : active + (e.key === "ArrowLeft" ? -1 : 1);
            setActive(Math.min(days.length - 1, Math.max(0, next)));
          } else if (e.key === "Enter" && active !== null) {
            onSelect(days[active].date);
          }
        }}
      >
        {width > 0 && (
          <svg width={width} height={HEIGHT} aria-hidden>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--color-ink-100)" strokeWidth={1} />
                <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--color-ink-600)">
                  {t}
                </text>
              </g>
            ))}

            {days.map((d, i) => {
              const isSelected = d.date === selected;
              if (!isSelected && (days.length - 1 - i) % labelEvery !== 0) return null;
              return (
                <text
                  key={d.date}
                  x={x(i)}
                  y={HEIGHT - 10}
                  textAnchor={i === 0 && days.length > 1 ? "start" : i === days.length - 1 && days.length > 1 ? "end" : "middle"}
                  fontSize={11}
                  fontWeight={isSelected ? 700 : 400}
                  fill={isSelected ? "var(--color-ink-900)" : "var(--color-ink-600)"}
                >
                  {formatDay(d.date, false).slice(4)}
                </text>
              );
            })}

            {/* The day whose report is open below. */}
            {days.map((d, i) =>
              d.date === selected ? (
                <line key="selected" x1={x(i)} x2={x(i)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--color-ink-200)" strokeWidth={1} />
              ) : null,
            )}
            {active !== null && (
              <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--color-ink-400)" strokeWidth={1} />
            )}

            {visible.map((s) => (
              <g key={s.key}>
                {days.length > 1 && (
                  <polyline
                    fill="none"
                    stroke={s.color}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    points={days.map((d, i) => `${x(i)},${y(d[s.key])}`).join(" ")}
                  />
                )}
                {days.map((d, i) => (
                  <circle
                    key={d.date}
                    cx={x(i)}
                    cy={y(d[s.key])}
                    r={active === i ? 5.5 : 4}
                    fill={s.color}
                    stroke="#fff"
                    strokeWidth={2}
                  />
                ))}
              </g>
            ))}
          </svg>
        )}

        {day && (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-[190px] rounded-lg border border-ink-100 bg-white px-3 py-2 shadow-lift"
            style={tipOnLeft ? { right: width - tipLeft + 12 } : { left: tipLeft + 12 }}
          >
            <p className="text-[12px] font-semibold text-ink-900">
              {formatDay(day.date)}
              {day.date === today ? " (today)" : ""}
            </p>
            {visible.map((s) => (
              <p key={s.key} className="mt-1 flex items-center gap-2 text-[12px] text-ink-600">
                <span className="h-[3px] w-3 flex-none rounded-full" style={{ background: s.color }} aria-hidden />
                <span className="font-display text-[14px] font-bold tabular-nums text-ink-900">{day[s.key]}</span>
                <span>{s.label}</span>
              </p>
            ))}
            <p className="mt-1.5 text-[11px] text-ink-400">Click to open this day</p>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, formatDay, windowLabel } from "@/lib/time";

export function DateNav({ date, today, onChange }: { date: string; today: string; onChange: (d: string) => void }) {
  const isToday = date === today;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          aria-label="Previous day"
          onClick={() => onChange(addDays(date, -1))}
        >
          <ChevronLeft size={18} strokeWidth={1.75} aria-hidden />
        </button>
        <label className="relative">
          <span className="sr-only">Check day</span>
          <input
            type="date"
            className="input w-[150px] font-semibold"
            value={date}
            max={today}
            onChange={(e) => e.target.value && onChange(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          aria-label="Next day"
          disabled={isToday}
          onClick={() => onChange(addDays(date, 1))}
        >
          <ChevronRight size={18} strokeWidth={1.75} aria-hidden />
        </button>
        {!isToday && (
          <button type="button" className="btn btn-ghost" onClick={() => onChange(today)}>
            Today
          </button>
        )}
      </div>
      <p className="mt-2 text-[13px] text-ink-600">
        <span className="font-semibold text-ink-800">
          {formatDay(date)}
          {isToday ? " (today)" : ""}
        </span>{" "}
        - documents from {windowLabel(date)}
      </p>
    </div>
  );
}

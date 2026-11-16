"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatDay, nextWorkingDay, nonWorkingReason, previousWorkingDay, windowLabel } from "@/lib/time";

/**
 * Steps between working days only. `latest` is the newest day that has a sheet:
 * today, or the last working day when today is a weekend or public holiday.
 */
export function DateNav({
  date,
  today,
  latest,
  onChange,
}: {
  date: string;
  today: string;
  latest: string;
  onChange: (d: string) => void;
}) {
  const isLatest = date >= latest;
  const todayOff = nonWorkingReason(today);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          aria-label="Previous working day"
          onClick={() => onChange(previousWorkingDay(date))}
        >
          <ChevronLeft size={18} strokeWidth={1.75} aria-hidden />
        </button>
        <label className="relative">
          <span className="sr-only">Check day</span>
          <input
            type="date"
            className="input w-[150px] font-semibold"
            value={date}
            max={latest}
            onChange={(e) => e.target.value && onChange(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          aria-label="Next working day"
          disabled={isLatest}
          onClick={() => onChange(nextWorkingDay(date))}
        >
          <ChevronRight size={18} strokeWidth={1.75} aria-hidden />
        </button>
        {!isLatest && (
          <button type="button" className="btn btn-ghost" onClick={() => onChange(latest)}>
            {latest === today ? "Today" : "Latest"}
          </button>
        )}
      </div>
      <p className="mt-2 text-[13px] text-ink-600">
        <span className="font-semibold text-ink-800">
          {formatDay(date)}
          {date === today ? " (today)" : ""}
        </span>{" "}
        - documents from {windowLabel(date)}
      </p>
      {todayOff && isLatest && (
        <p className="text-[12px] text-ink-600">
          Today is {todayOff === "Saturday" || todayOff === "Sunday" ? `a ${todayOff}` : todayOff}, so there is no sheet
          today. Showing the last working day.
        </p>
      )}
    </div>
  );
}

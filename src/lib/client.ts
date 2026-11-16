"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { isValidDate, sastDate } from "./time";
import type { DayCheck, DayResponse, StepKey } from "./types";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  if (res.status === 401 && !path.startsWith("/api/session")) {
    const next = window.location.pathname + window.location.search;
    window.location.href = `/login?next=${encodeURIComponent(next)}`;
    throw new Error("Sign in to continue");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || "Something went wrong. Please try again.");
  return body as T;
}

/** The selected check day lives in the URL (?date=YYYY-MM-DD) so links and reloads keep it. */
export function useCheckDate(): { date: string; today: string; setDate: (d: string) => void } {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const today = sastDate();
  const raw = params.get("date");
  const date = isValidDate(raw) && raw <= today ? raw : today;
  const setDate = useCallback(
    (d: string) => {
      if (!isValidDate(d)) return;
      const clamped = d > today ? today : d;
      router.replace(clamped === today ? pathname : `${pathname}?date=${clamped}`, { scroll: false });
    },
    [router, pathname, today],
  );
  return { date, today, setDate };
}

const PERSON_KEY = "scr.person";

/** Remembers who is using this device so their lines are shown first time, every time. */
export function usePerson(): [string, (p: string) => void] {
  const [person, setPersonState] = useState("");
  useEffect(() => {
    try {
      setPersonState(window.localStorage.getItem(PERSON_KEY) || "");
    } catch {}
  }, []);
  const setPerson = useCallback((p: string) => {
    setPersonState(p);
    try {
      window.localStorage.setItem(PERSON_KEY, p);
    } catch {}
  }, []);
  return [person, setPerson];
}

export interface StepChange {
  checked?: boolean;
  count?: number | null;
  comment?: string;
}

export type SaveState = "idle" | "saving" | "saved" | "error";

const POLL_MS = 20000;

/** Loads a day's check sheet, keeps it fresh while the tab is open, and saves edits as they are made. */
export function useDay(date: string, by: string) {
  const [data, setData] = useState<DayResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const inFlight = useRef(new Map<string, number>());
  const lastSaved = useRef(new Map<string, number>());
  const dateRef = useRef(date);
  dateRef.current = date;

  const load = useCallback(async (d: string, replace: boolean) => {
    const started = Date.now();
    try {
      const fresh = await api<DayResponse>(`/api/day?date=${d}`);
      if (dateRef.current !== d) return;
      setError(null);
      setData((prev) => {
        if (replace || !prev || prev.date !== d) return fresh;
        // Keep rows that were edited here while this refresh was on its way.
        const local = new Map(prev.checks.map((c) => [c.lineId, c]));
        return {
          ...fresh,
          checks: fresh.checks.map((c) => {
            const busy = inFlight.current.has(c.lineId) || (lastSaved.current.get(c.lineId) ?? 0) >= started;
            return busy ? local.get(c.lineId) ?? c : c;
          }),
        };
      });
    } catch (err) {
      if (dateRef.current === d) setError(err instanceof Error ? err.message : "Could not load the day");
    }
  }, []);

  useEffect(() => {
    setData(null);
    setError(null);
    load(date, true);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load(date, false);
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") load(date, false);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [date, load]);

  const update = useCallback(
    async (lineId: string, step: StepKey, change: StepChange) => {
      const d = dateRef.current;
      const apply = (fn: (c: DayCheck) => DayCheck) =>
        setData((prev) =>
          prev && prev.date === d
            ? { ...prev, checks: prev.checks.map((c) => (c.lineId === lineId ? fn(c) : c)) }
            : prev,
        );
      // Show the change immediately; the server response then confirms it.
      apply((c) => {
        const entry = { ...c[step] };
        if (change.comment !== undefined) entry.comment = change.comment;
        if (change.checked !== undefined) {
          entry.checked = change.checked;
          entry.count = change.checked ? change.count ?? 0 : null;
        }
        return { ...c, [step]: entry };
      });
      inFlight.current.set(lineId, (inFlight.current.get(lineId) ?? 0) + 1);
      setSaveState("saving");
      try {
        const saved = await api<DayCheck>("/api/checks", {
          method: "PATCH",
          body: JSON.stringify({ date: d, lineId, step, ...change, by }),
        });
        lastSaved.current.set(lineId, Date.now());
        const remaining = (inFlight.current.get(lineId) ?? 1) - 1;
        if (remaining <= 0) {
          inFlight.current.delete(lineId);
          apply(() => saved);
        } else {
          inFlight.current.set(lineId, remaining);
        }
        setSaveError(null);
        setSaveState(inFlight.current.size === 0 ? "saved" : "saving");
      } catch (err) {
        inFlight.current.delete(lineId);
        setSaveError(err instanceof Error ? err.message : "Could not save");
        setSaveState("error");
        load(d, true); // fall back to what the server has
      }
    },
    [by, load],
  );

  return { data, error, saveState, saveError, update, reload: () => load(date, true) };
}

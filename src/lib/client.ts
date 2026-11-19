"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { FIRST_SHEET, isValidDate, latestWorkingDay, sastDate } from "./time";
import type { DayCheck, DayResponse, SessionUser, StepKey } from "./types";

/** The signed-in person, provided by the app shell. Null until it is known. */
export const SessionContext = createContext<SessionUser | null>(null);
export const useSessionUser = () => useContext(SessionContext);

function goTo(path: string): void {
  const next = window.location.pathname + window.location.search;
  window.location.href = `${path}?next=${encodeURIComponent(next)}`;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const authCall = path.startsWith("/api/session") || path.startsWith("/api/password");
  if (res.status === 401 && !authCall) {
    goTo("/login");
    throw new Error("Sign in to continue");
  }
  const body = await res.json().catch(() => null);
  if (res.status === 403 && body?.code === "password_change" && !authCall) {
    goTo("/password");
    throw new Error("Choose a new password to continue");
  }
  if (!res.ok) throw new Error(body?.error || "Something went wrong. Please try again.");
  return body as T;
}

/**
 * The selected sheet lives in the URL (?date=YYYY-MM-DD) so links and reloads keep it.
 * Without one, the page shows `fallback` (each page picks the sheet that matters most).
 * `latest` is the newest sheet that exists: today's, or the last working day's.
 */
export function useCheckDate(fallback?: string): {
  date: string;
  today: string;
  latest: string;
  setDate: (d: string) => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const today = sastDate();
  const latest = latestWorkingDay(today);
  const home = fallback && fallback <= latest ? fallback : latest;
  const raw = params.get("date");
  const date = isValidDate(raw) && raw <= latest && raw >= FIRST_SHEET ? latestWorkingDay(raw) : home;
  const setDate = useCallback(
    (d: string) => {
      if (!isValidDate(d)) return;
      const target = d > latest ? latest : d < FIRST_SHEET ? FIRST_SHEET : latestWorkingDay(d);
      router.replace(target === home ? pathname : `${pathname}?date=${target}`, { scroll: false });
    },
    [router, pathname, latest, home],
  );
  return { date, today, latest, setDate };
}

/** A filter choice remembered on this device, so people see their own lines first time, every time. */
export function useStored(key: string): [string, (value: string) => void] {
  const [value, setValueState] = useState("");
  useEffect(() => {
    try {
      setValueState(window.localStorage.getItem(key) || "");
    } catch {}
  }, [key]);
  const setValue = useCallback(
    (next: string) => {
      setValueState(next);
      try {
        window.localStorage.setItem(key, next);
      } catch {}
    },
    [key],
  );
  return [value, setValue];
}

export interface StepChange {
  checked?: boolean;
  count?: number | null;
  comment?: string;
}

export type SaveState = "idle" | "saving" | "saved" | "error";

const POLL_MS = 20000;

/** Loads a day's check sheet, keeps it fresh while the tab is open, and saves edits as they are made. */
export function useDay(date: string) {
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
          body: JSON.stringify({ date: d, lineId, step, ...change }),
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
    [load],
  );

  return { data, error, saveState, saveError, update, reload: () => load(date, true) };
}

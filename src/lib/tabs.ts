"use client";

/**
 * Keeps track of which browser tabs have the app open, so the page can tell the
 * server when the last one closes. Everything here is best-effort: if the browser
 * blocks storage, the server's inactivity limit still ends the session.
 */
const TAB_KEY = "scr.tab";
const TABS_KEY = "scr.tabs";
const FRESH_MS = 90 * 1000;

export interface TabInfo {
  id: string;
  /** True when this tab already had the app open before this page load (a reload). */
  known: boolean;
}

export function thisTab(): TabInfo | null {
  try {
    const existing = window.sessionStorage.getItem(TAB_KEY);
    if (existing) return { id: existing, known: true };
    const id = crypto.randomUUID();
    window.sessionStorage.setItem(TAB_KEY, id);
    return { id, known: false };
  } catch {
    return null;
  }
}

function readTabs(): Record<string, number> {
  try {
    const value = JSON.parse(window.localStorage.getItem(TABS_KEY) || "{}");
    return typeof value === "object" && value !== null ? value : {};
  } catch {
    return {};
  }
}

function writeTabs(tabs: Record<string, number>): void {
  try {
    window.localStorage.setItem(TABS_KEY, JSON.stringify(tabs));
  } catch {}
}

/** Records that this tab is still open. */
export function touchTab(id: string): void {
  const now = Date.now();
  const tabs = readTabs();
  for (const key of Object.keys(tabs)) if (now - tabs[key] > FRESH_MS) delete tabs[key];
  tabs[id] = now;
  writeTabs(tabs);
}

/** Removes this tab and returns whether any other tab still has the app open. */
export function leaveTab(id: string): boolean {
  const now = Date.now();
  const tabs = readTabs();
  delete tabs[id];
  writeTabs(tabs);
  return Object.values(tabs).some((seen) => now - seen <= FRESH_MS);
}

"use client";

import { Bell, BellOff, BellRing } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";

type State = "loading" | "unsupported" | "blocked" | "off" | "on";

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = (base64url + "===".slice((base64url.length + 3) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  return reg;
}

/** Admin: turn desktop alerts for new sign-ups on or off for this computer. */
export function AlertsCard() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const refresh = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("blocked");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (!sub) {
        setState("off");
        return;
      }
      const res = await api<{ on: boolean }>(`/api/push?endpoint=${encodeURIComponent(sub.endpoint)}`);
      setState(res.on ? "on" : "off");
    } catch {
      setState("off");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const turnOn = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        setBusy(false);
        return;
      }
      const { publicKey } = await api<{ publicKey: string }>("/api/push");
      const reg = await registration();
      let sub = await reg.pushManager.getSubscription();
      // A subscription made with different keys cannot be used; start again.
      const current = sub?.options.applicationServerKey;
      if (sub && current) {
        const existing = new Uint8Array(current);
        const wanted = keyBytes(publicKey);
        if (existing.length !== wanted.length || existing.some((b, i) => b !== wanted[i])) {
          await sub.unsubscribe();
          sub = null;
        }
      }
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
      await api("/api/push", { method: "POST", body: JSON.stringify({ subscription: sub.toJSON() }) });
      setState("on");
      setMessage({ tone: "ok", text: "Alerts are on for this computer. Use Send test to check you can see them." });
    } catch (err) {
      // Chrome refuses to register in private (Incognito) windows and in some managed or
      // locked-down setups; the browser's own wording is not helpful to most people.
      const registration = err instanceof Error && err.name === "AbortError";
      setMessage({
        tone: "error",
        text: registration
          ? "Chrome could not register this computer for alerts. Make sure you are not in an Incognito window and that Chrome is up to date, then try again."
          : err instanceof Error && err.message
            ? `Alerts could not be turned on: ${err.message}`
            : "Alerts could not be turned on.",
      });
    }
    setBusy(false);
  };

  const turnOff = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await api(`/api/push?endpoint=${encodeURIComponent(sub.endpoint)}`, { method: "DELETE" });
        await sub.unsubscribe();
      }
      setState("off");
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Alerts could not be turned off." });
    }
    setBusy(false);
  };

  const test = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await api("/api/push/test", { method: "POST" });
      setMessage({
        tone: "ok",
        text: "Test alert sent. If it did not appear, check that notifications for Chrome are allowed in your computer's settings.",
      });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "The test alert could not be sent." });
    }
    setBusy(false);
  };

  const Icon = state === "on" ? BellRing : state === "blocked" || state === "unsupported" ? BellOff : Bell;

  return (
    <section className="card mt-3 flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3" aria-label="Desktop alerts">
      <span
        className={`flex h-10 w-10 flex-none items-center justify-center rounded-full ${
          state === "on" ? "bg-brand-100 text-brand" : "bg-ink-100 text-ink-600"
        }`}
      >
        <Icon size={20} strokeWidth={1.75} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink-900">
          Desktop alerts on this computer:{" "}
          {state === "on"
            ? "On"
            : state === "loading"
              ? "..."
              : state === "blocked"
                ? "Blocked"
                : state === "unsupported"
                  ? "Not available"
                  : "Off"}
        </p>
        <p className="text-[12px] text-ink-600">
          {state === "unsupported"
            ? "This browser cannot show alerts. Use Chrome or Edge on a computer."
            : state === "blocked"
              ? "Notifications are blocked for this site. In Chrome, click the icon to the left of the web address, open Site settings, set Notifications to Allow, then reload this page."
              : "Get a notification when someone signs up and is waiting for approval, even when this app is closed. Chrome must be running. Turn it on separately on each computer you use."}
        </p>
        {message && (
          <p className={`mt-1 text-[12px] font-semibold ${message.tone === "ok" ? "text-brand" : "text-danger"}`} role="status">
            {message.text}
          </p>
        )}
      </div>
      {state === "on" && (
        <>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={test}>
            Send test
          </button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={turnOff}>
            Turn off
          </button>
        </>
      )}
      {state === "off" && (
        <button type="button" className="btn btn-primary" disabled={busy} onClick={turnOn}>
          <Bell size={16} strokeWidth={1.75} aria-hidden />
          Turn on alerts
        </button>
      )}
    </section>
  );
}

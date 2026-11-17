"use client";

import { MessagesSquare } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";

interface Status {
  on: boolean;
  target: string | null;
  updatedBy: string | null;
  reports: boolean;
}

const STEPS = [
  "In Teams, open the channel (or chat) where the alerts should go.",
  "Click the three dots next to the channel name, then Workflows.",
  'Choose the template "Send webhook alerts to a channel" (for a chat: "Send webhook alerts to a chat").',
  "Give it a name such as Stock Control Room, click Next, check the team and channel, then Add workflow.",
  "Copy the web address Teams shows you, paste it below and click Save.",
];

/** Admin: post a message to a Teams channel or chat when someone signs up. */
export function TeamsCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [url, setUrl] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await api<Status>("/api/teams"));
    } catch {
      setStatus({ on: false, target: null, updatedBy: null, reports: false });
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const test = async (afterSave = false) => {
    setBusy(true);
    try {
      await api("/api/teams/test", { method: "POST" });
      setMessage({
        tone: "ok",
        text: afterSave
          ? "Saved. A test message has been posted to Teams; check the channel."
          : "Test message posted. Check the Teams channel.",
      });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "The test message could not be sent." });
    }
    setBusy(false);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      setStatus(await api<Status>("/api/teams", { method: "PUT", body: JSON.stringify({ url: url.trim() }) }));
      setUrl("");
      setEditing(false);
      await test(true);
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Could not save" });
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Stop posting sign-ups to Teams?")) return;
    setBusy(true);
    setMessage(null);
    try {
      setStatus(await api<Status>("/api/teams", { method: "DELETE" }));
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Could not remove" });
    }
    setBusy(false);
  };

  const toggleReports = async () => {
    if (!status) return;
    setBusy(true);
    setMessage(null);
    try {
      setStatus(await api<Status>("/api/teams", { method: "PATCH", body: JSON.stringify({ reports: !status.reports }) }));
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Could not change the reports" });
    }
    setBusy(false);
  };

  const reportNow = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await api("/api/teams/report", { method: "POST" });
      setMessage({ tone: "ok", text: "Today's report has been posted to Teams." });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "The report could not be posted." });
    }
    setBusy(false);
  };

  const showForm = status && (!status.on || editing);

  return (
    <section className="card mt-3 px-4 py-3" aria-label="Teams alerts">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <span
          className={`flex h-10 w-10 flex-none items-center justify-center rounded-full ${
            status?.on ? "bg-brand-100 text-brand" : "bg-ink-100 text-ink-600"
          }`}
        >
          <MessagesSquare size={20} strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink-900">Teams alerts: {status === null ? "..." : status.on ? "On" : "Off"}</p>
          <p className="text-[12px] text-ink-600">
            {status?.on
              ? `Posting new sign-ups to Teams (${status.target}). Set up by ${status.updatedBy}.`
              : "Post a message to a Teams channel or chat whenever someone signs up and is waiting for approval. Everyone in that channel sees it, on any device."}
          </p>
        </div>
        {status?.on && !editing && (
          <>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => test()}>
              Send test
            </button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setEditing(true)}>
              Change
            </button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={remove}>
              Turn off
            </button>
          </>
        )}
      </div>

      {status?.on && !editing && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-ink-100 pt-3">
          <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
            <input type="checkbox" className="check mt-0.5" checked={status.reports} disabled={busy} onChange={toggleReports} />
            <span>
              <span className="block font-semibold text-ink-900">Daily reports to Teams</span>
              <span className="text-[12px] text-ink-600">
                At 10:00, 15:00 and 18:00 on working days: checks done and not done (by accountable and responsible
                person) and any count mismatches.
              </span>
            </span>
          </label>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={reportNow}>
            Send report now
          </button>
        </div>
      )}

      {showForm && (
        <form onSubmit={save} className="mt-3 border-t border-ink-100 pt-3">
          <p className="caps mb-1">How to set it up (once)</p>
          <ol className="mb-3 list-decimal space-y-0.5 pl-5 text-[13px] text-ink-800">
            {STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <label className="block">
            <span className="caps mb-1 block">Teams workflow address</span>
            <span className="flex flex-wrap gap-2">
              <input
                type="url"
                className="input min-w-0 flex-1 font-mono text-[12px]"
                placeholder="https://...logic.azure.com/... or https://...powerplatform.com/..."
                autoComplete="off"
                spellCheck={false}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              {editing && (
                <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              )}
              <button type="submit" className="btn btn-primary" disabled={busy || !url.trim()}>
                {busy ? "Saving..." : "Save and test"}
              </button>
            </span>
            <span className="mt-1 block text-[12px] text-ink-600">
              Treat this address like a password: anyone who has it can post into that channel.
            </span>
          </label>
        </form>
      )}

      {message && (
        <p className={`mt-2 text-[12px] font-semibold ${message.tone === "ok" ? "text-brand" : "text-danger"}`} role="status">
          {message.text}
        </p>
      )}
    </section>
  );
}

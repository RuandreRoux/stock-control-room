"use client";

import { MessageSquarePlus, Pencil } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/client";
import { formatDay, formatTime, sastDate } from "@/lib/time";
import type { DayCheck } from "@/lib/types";

/** The reason for a count mismatch: shown with who wrote it and when, and editable in place. */
export function ReasonCell({ check, onSaved }: { check: DayCheck; onSaved: (updated: DayCheck) => void }) {
  const reason = check.reason;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(reason?.text ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await api<DayCheck>("/api/checks/reason", {
        method: "PUT",
        body: JSON.stringify({ date: check.date, lineId: check.lineId, text }),
      });
      onSaved(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    }
    setBusy(false);
  };

  if (editing) {
    return (
      <div className="min-w-[220px]">
        <textarea
          className="input text-[13px]"
          rows={3}
          maxLength={1000}
          autoFocus
          placeholder="Why did the counts not match?"
          aria-label={`Reason for the mismatch - ${check.line.stockMovement}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {error && <p className="mt-1 text-[12px] font-semibold text-danger">{error}</p>}
        <div className="mt-1.5 flex gap-2">
          <button type="button" className="btn btn-primary h-8 px-3" disabled={busy} onClick={save}>
            {busy ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            className="btn btn-ghost h-8 px-3"
            disabled={busy}
            onClick={() => {
              setText(reason?.text ?? "");
              setEditing(false);
              setError(null);
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (!reason) {
    return (
      <button type="button" className="btn btn-ghost h-8 px-3" onClick={() => setEditing(true)}>
        <MessageSquarePlus size={15} strokeWidth={1.75} aria-hidden />
        Add reason
      </button>
    );
  }

  const day = sastDate(reason.at);
  return (
    <div className="min-w-[200px]">
      <p className="whitespace-pre-wrap text-[13px] text-ink-900">{reason.text}</p>
      <p className="mt-1 flex items-center gap-2 text-[12px] text-ink-600">
        <span>
          {reason.by ?? "Someone"}, {day === sastDate() ? "today" : formatDay(day, false)} {formatTime(reason.at)}
        </span>
        <button
          type="button"
          className="inline-flex items-center gap-1 font-semibold text-brand hover:text-sea"
          onClick={() => {
            setText(reason.text);
            setEditing(true);
          }}
        >
          <Pencil size={12} strokeWidth={1.75} aria-hidden />
          Edit
        </button>
      </p>
    </div>
  );
}

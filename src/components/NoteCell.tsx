"use client";

import { MessageSquarePlus, Pencil } from "lucide-react";
import { useState } from "react";
import { formatDay, formatTime, sastDate } from "@/lib/time";

/** A short note shown with who wrote it and when, editable in place. */
export function NoteCell({
  text,
  by,
  at,
  addLabel,
  placeholder,
  label,
  onSave,
}: {
  text: string;
  by?: string | null;
  at?: string | null;
  addLabel: string;
  placeholder: string;
  /** Read out by screen readers for the text box. */
  label: string;
  onSave: (text: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave(draft.trim());
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
          placeholder={placeholder}
          aria-label={label}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
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
              setDraft(text);
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

  if (!text) {
    return (
      <button type="button" className="btn btn-ghost h-8 px-3" onClick={() => setEditing(true)}>
        <MessageSquarePlus size={15} strokeWidth={1.75} aria-hidden />
        {addLabel}
      </button>
    );
  }

  const day = at ? sastDate(at) : null;
  return (
    <div className="min-w-[200px]">
      <p className="whitespace-pre-wrap text-[13px] text-ink-900">{text}</p>
      <p className="mt-1 flex items-center gap-2 text-[12px] text-ink-600">
        {(by || at) && (
          <span>
            {by ?? "Someone"}
            {at && day ? `, ${day === sastDate() ? "today" : formatDay(day, false)} ${formatTime(at)}` : ""}
          </span>
        )}
        <button
          type="button"
          className="inline-flex items-center gap-1 font-semibold text-brand hover:text-sea"
          onClick={() => {
            setDraft(text);
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

"use client";

import { api } from "@/lib/client";
import type { DayCheck } from "@/lib/types";
import { NoteCell } from "./NoteCell";

/** The reason for a count mismatch: shown with who wrote it and when, and editable in place. */
export function ReasonCell({ check, onSaved }: { check: DayCheck; onSaved: (updated: DayCheck) => void }) {
  return (
    <NoteCell
      text={check.reason?.text ?? ""}
      by={check.reason?.by}
      at={check.reason?.at}
      addLabel="Add reason"
      placeholder="Why did the counts not match?"
      label={`Reason for the mismatch - ${check.line.stockMovement}`}
      onSave={async (text) => {
        const updated = await api<DayCheck>("/api/checks/reason", {
          method: "PUT",
          body: JSON.stringify({ date: check.date, lineId: check.lineId, text }),
        });
        onSaved(updated);
      }}
    />
  );
}

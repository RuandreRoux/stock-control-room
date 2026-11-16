"use client";

import { useState } from "react";
import { api } from "@/lib/client";

export function AccessForm({ label, onDone }: { label: string; onDone: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api("/api/session", { method: "POST", body: JSON.stringify({ code }) });
          onDone();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not sign in");
          setBusy(false);
        }
      }}
    >
      <label className="block">
        <span className="caps mb-1 block">{label}</span>
        <input
          type="password"
          autoComplete="current-password"
          autoFocus
          className={`input ${error ? "border-danger" : ""}`}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-invalid={!!error}
        />
        {error && <span className="mt-1 block text-[12px] font-semibold text-danger">{error}</span>}
      </label>
      <button type="submit" className="btn btn-primary w-full" disabled={busy || !code}>
        {busy ? "Checking..." : "Continue"}
      </button>
    </form>
  );
}

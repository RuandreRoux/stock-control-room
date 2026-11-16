"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

/** A password box with a show/hide button, so people can check what they typed. */
export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  autoFocus,
  error,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  autoFocus?: boolean;
  error?: string | null;
  hint?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <label className="block">
      <span className="caps mb-1 block">{label}</span>
      <span className="relative block">
        <input
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          className={`input pr-10 ${error ? "border-danger" : ""}`}
          value={value}
          maxLength={200}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-1 top-1 flex h-7 w-8 items-center justify-center rounded-sm text-ink-600 hover:bg-brand-50 hover:text-brand"
        >
          {show ? <EyeOff size={16} strokeWidth={1.75} aria-hidden /> : <Eye size={16} strokeWidth={1.75} aria-hidden />}
        </button>
      </span>
      {error ? (
        <span className="mt-1 block text-[12px] font-semibold text-danger">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-[12px] text-ink-600">{hint}</span>
      ) : null}
    </label>
  );
}

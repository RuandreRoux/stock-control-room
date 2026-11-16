"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandBackdrop, Logo } from "@/components/Brand";
import { PasswordField } from "@/components/PasswordField";
import { PasswordRules } from "@/components/PasswordRules";
import { api } from "@/lib/client";
import { passwordRules } from "@/lib/password-rules";
import type { SessionUser } from "@/lib/types";

export default function PasswordPage() {
  const raw = useSearchParams().get("next");
  const target = raw && raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/password") ? raw : "/";
  const [user, setUser] = useState<SessionUser | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ user: SessionUser | null }>("/api/session")
      .then((res) => {
        if (!res.user) window.location.href = "/login";
        else setUser(res.user);
      })
      .catch(() => setError("Could not load your account. Please try again."));
  }, []);

  const mismatch = again.length > 0 && next !== again ? "The two new passwords do not match" : null;
  const rules = passwordRules(next);
  const rulesMet = rules.every((rule) => rule.ok);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/password", { method: "POST", body: JSON.stringify({ current, next }) });
      window.location.href = target;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the password");
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-brand-900 px-4 py-10">
      <BrandBackdrop />
      <div className="rise-in relative w-full max-w-[420px] rounded-xl bg-white p-6 shadow-modal sm:p-8">
        <div className="flex justify-center">
          <Logo width={150} />
        </div>
        <h1 className="mt-5 font-display text-xl font-bold text-ink-900">
          {user?.mustChangePassword ? "Choose Your Password" : "Change Password"}
        </h1>
        <p className="mb-4 mt-1 text-[13px] text-ink-600">
          {user?.mustChangePassword
            ? "You signed in with a temporary password. Choose your own before you continue."
            : user
              ? `Signed in as ${user.name}.`
              : "Loading your account..."}
        </p>
        <form className="space-y-3" onSubmit={save}>
          <PasswordField
            label={user?.mustChangePassword ? "Temporary password" : "Current password"}
            value={current}
            onChange={setCurrent}
            autoComplete="current-password"
            autoFocus
          />
          <PasswordField label="New password" value={next} onChange={setNext} autoComplete="new-password" />
          <PasswordRules password={next} />
          <PasswordField label="New password again" value={again} onChange={setAgain} autoComplete="new-password" error={mismatch} />
          {error && (
            <p role="alert" className="text-[13px] font-semibold text-danger">
              {error}
            </p>
          )}
          <div className="flex gap-2 pt-1">
            {user && !user.mustChangePassword && (
              <a href={target} className="btn btn-ghost flex-1">
                Cancel
              </a>
            )}
            <button type="submit" className="btn btn-primary flex-1" disabled={busy || !user || !current || !rulesMet || next !== again}>
              {busy ? "Saving..." : "Save password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

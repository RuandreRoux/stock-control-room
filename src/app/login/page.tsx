"use client";

import { useSearchParams } from "next/navigation";
import { AccessForm } from "@/components/AccessForm";

export default function LoginPage() {
  const next = useSearchParams().get("next") || "/";
  // Only ever return to a page inside this app.
  const target = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return (
    <div className="mx-auto mt-12 max-w-sm">
      <div className="card p-6">
        <h1 className="font-display text-xl font-bold text-ink-900">Sign In</h1>
        <p className="mb-4 mt-1 text-[13px] text-ink-600">Enter the access code your team was given.</p>
        <AccessForm label="Access code" onDone={() => (window.location.href = target)} />
      </div>
    </div>
  );
}

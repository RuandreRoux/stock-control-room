"use client";

import { useSearchParams } from "next/navigation";
import { AccessForm } from "@/components/AccessForm";
import { BrandBackdrop, Logo } from "@/components/Brand";

const FACTS = [
  { value: "06:00", label: "Business day starts" },
  { value: "10:00", label: "Document counts due" },
  { value: "Mon-Fri", label: "Working days" },
];

export default function LoginPage() {
  const next = useSearchParams().get("next") || "/";
  // Only ever return to a page inside this app.
  const target = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return (
    <div className="relative min-h-screen overflow-hidden bg-brand-900">
      <BrandBackdrop />
      <div className="relative mx-auto grid min-h-screen max-w-[1200px] content-center items-center gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-16">
        <div className="rise-in text-white">
          <p className="font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-lime">
            Agri Technovation - Wellington
          </p>
          <h1 className="mt-2 font-display text-[36px] font-bold leading-[1.15] tracking-[-0.01em] sm:text-[56px]">
            Stock Control Room
          </h1>
          <p className="mt-4 max-w-md text-[16px] leading-[1.6] text-white/90">
            Every document counted by the stock team and confirmed by the data capturers, every working day.
          </p>
          <dl className="mt-8 hidden max-w-md grid-cols-3 sm:grid">
            {FACTS.map((fact, i) => (
              <div key={fact.label} className={i ? "border-l border-white/20 pl-6" : "pr-6"}>
                <dt className="sr-only">{fact.label}</dt>
                <dd>
                  <span className="block font-display text-[28px] font-bold leading-tight">{fact.value}</span>
                  <span className="mt-1 block text-[12px] uppercase tracking-[0.05em] text-white/80">{fact.label}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="rise-in rounded-xl bg-white p-6 shadow-modal sm:p-8" style={{ animationDelay: "80ms" }}>
          <div className="flex justify-center">
            <Logo width={190} />
          </div>
          <h2 className="mt-6 font-display text-xl font-bold text-ink-900">Sign In</h2>
          <p className="mb-4 mt-1 text-[13px] text-ink-600">Enter the access code your team was given.</p>
          <AccessForm label="Access code" onDone={() => (window.location.href = target)} />
        </div>
      </div>
    </div>
  );
}

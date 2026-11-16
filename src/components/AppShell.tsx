"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { LogoMark } from "./Brand";

const NAV = [
  { href: "/", label: "Daily checks", short: "" },
  { href: "/exceptions", label: "Exceptions dashboard", short: "Exceptions" },
  { href: "/admin", label: "Admin", short: "" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const date = useSearchParams().get("date");
  const query = date ? `?date=${date}` : "";
  // The sign-in screen is full-bleed and carries its own branding.
  if (pathname === "/login") return <>{children}</>;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-ink-100 bg-white">
        <div className="mx-auto flex h-14 max-w-[1680px] items-center gap-4 px-4">
          <Link href={`/${query}`} className="flex items-center gap-2" aria-label="Stock Control Room">
            <LogoMark height={36} />
            <span className="hidden leading-tight sm:block">
              <span className="block font-display text-[15px] font-bold text-ink-900">Stock Control Room</span>
              <span className="block text-[11px] text-ink-600">Agri Technovation</span>
            </span>
          </Link>
          <nav className="ml-auto flex h-full items-stretch" aria-label="Main">
            {NAV.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href === "/admin" ? item.href : `${item.href}${query}`}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center whitespace-nowrap px-3 font-display text-[12px] font-semibold uppercase tracking-[0.08em] transition-colors duration-200 sm:px-4 ${
                    active
                      ? "bg-brand-50 text-brand shadow-[inset_0_-2px_0_var(--color-lime)]"
                      : "text-ink-600 hover:bg-brand-50 hover:text-brand"
                  }`}
                >
                  {item.short ? (
                    <>
                      <span className="sm:hidden">{item.short}</span>
                      <span className="hidden sm:inline">{item.label}</span>
                    </>
                  ) : (
                    item.label
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-[1680px] px-4 pb-16 pt-6">{children}</main>
    </div>
  );
}

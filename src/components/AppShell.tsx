"use client";

import { ClipboardCheck } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const NAV = [
  { href: "/", label: "Daily checks" },
  { href: "/exceptions", label: "Exceptions" },
  { href: "/admin", label: "Admin" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const date = useSearchParams().get("date");
  const query = date ? `?date=${date}` : "";
  const showNav = pathname !== "/login";

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-ink-100 bg-white">
        <div className="mx-auto flex h-14 max-w-[1680px] items-center gap-4 px-4">
          <Link href={`/${query}`} className="flex items-center gap-2" aria-label="Stock Control Room">
            <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-brand text-white">
              <ClipboardCheck size={18} strokeWidth={1.75} aria-hidden />
            </span>
            <span className="hidden leading-tight sm:block">
              <span className="block font-display text-[15px] font-bold text-ink-900">Stock Control Room</span>
              <span className="block text-[11px] text-ink-600">Agri Technovation</span>
            </span>
          </Link>
          {showNav && (
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
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-[1680px] px-4 pb-16 pt-6">{children}</main>
    </div>
  );
}

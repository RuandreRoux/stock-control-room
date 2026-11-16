"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, SessionContext } from "@/lib/client";
import { leaveTab, thisTab, touchTab } from "@/lib/tabs";
import type { SessionUser } from "@/lib/types";
import { LogoMark, Splash } from "./Brand";

const NAV = [
  { href: "/", label: "Daily checks", short: "", adminOnly: false },
  { href: "/exceptions", label: "Exceptions dashboard", short: "Exceptions", adminOnly: false },
  { href: "/admin", label: "Admin", short: "", adminOnly: true },
];

// Pages that carry their own full-screen layout and do not need a signed-in user to render.
const BARE = ["/login", "/password"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const date = useSearchParams().get("date");
  const query = date ? `?date=${date}` : "";
  const bare = BARE.includes(pathname);
  const [user, setUser] = useState<SessionUser | null>(null);

  const [waiting, setWaiting] = useState(0);

  // Nothing is shown until the server confirms who is signed in.
  useEffect(() => {
    if (bare) return;
    let cancelled = false;
    const tab = thisTab();
    const toSignIn = () => {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login?next=${next}`;
    };

    api<{ user: SessionUser | null }>(`/api/session${tab ? `?tab=${tab.known ? "known" : "new"}` : ""}`)
      .then((res) => {
        if (cancelled) return;
        if (!res.user) toSignIn();
        else if (res.user.mustChangePassword) {
          window.location.href = `/password?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
        } else setUser(res.user);
      })
      .catch(() => {});

    // While the app is open it checks in regularly. That keeps the session alive, and
    // notices straight away when it has been ended somewhere else.
    if (tab) touchTab(tab.id);
    const beat = window.setInterval(() => {
      if (tab) touchTab(tab.id);
      api<{ user: SessionUser | null }>("/api/session")
        .then((res) => {
          if (!cancelled && !res.user) toSignIn();
        })
        .catch(() => {});
    }, 20000);

    // When the last tab with the app closes, tell the server so the session ends there too.
    const onHide = () => {
      if (tab && !leaveTab(tab.id)) navigator.sendBeacon("/api/session/close");
    };
    const onShow = () => {
      if (tab) touchTab(tab.id);
    };
    window.addEventListener("pagehide", onHide);
    window.addEventListener("pageshow", onShow);
    return () => {
      cancelled = true;
      window.clearInterval(beat);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("pageshow", onShow);
    };
  }, [bare]);

  // Admins see when someone has signed up and is waiting to be approved.
  const isAdmin = user?.role === "admin";
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    const load = () =>
      api<{ count: number }>("/api/users/pending")
        .then((res) => !cancelled && setWaiting(res.count))
        .catch(() => {});
    load();
    const timer = window.setInterval(load, 60000);
    window.addEventListener("scr:users-changed", load);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("scr:users-changed", load);
    };
  }, [isAdmin, pathname]);

  if (bare) return <>{children}</>;
  if (!user) return <Splash />;

  const signOut = async () => {
    await api("/api/session", { method: "DELETE" }).catch(() => {});
    window.location.href = "/login";
  };

  return (
    <SessionContext.Provider value={user}>
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-ink-100 bg-white">
        <div className="mx-auto flex h-14 max-w-[1680px] items-center gap-2 px-4 sm:gap-4">
          <Link href={`/${query}`} className="flex items-center gap-2" aria-label="Stock Control Room">
            <LogoMark height={36} />
            <span className="hidden leading-tight sm:block">
              <span className="block font-display text-[15px] font-bold text-ink-900">Stock Control Room</span>
              <span className="block text-[11px] text-ink-600">Agri Technovation</span>
            </span>
          </Link>
          <nav className="ml-auto flex h-full min-w-0 items-stretch overflow-x-auto" aria-label="Main">
            {NAV.filter((item) => !item.adminOnly || user.role === "admin").map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href === "/admin" ? item.href : `${item.href}${query}`}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center whitespace-nowrap px-2 font-display text-[12px] font-semibold uppercase tracking-[0.08em] transition-colors duration-200 sm:px-4 ${
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
                  {item.adminOnly && waiting > 0 && (
                    <span
                      className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-lime px-1 text-[10px] font-bold tracking-normal text-ink-900"
                      title={`${waiting} waiting for approval`}
                    >
                      {waiting}
                      <span className="sr-only"> waiting for approval</span>
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
          <div className="flex flex-none items-center gap-2 border-l border-ink-100 pl-2 sm:pl-3">
            <Link
              href="/password"
              title="Change your password"
              className="hidden max-w-[160px] truncate text-[13px] font-semibold text-ink-800 hover:text-brand md:block"
            >
              {user.name}
            </Link>
            <button type="button" className="btn btn-ghost h-8 px-2 sm:px-3" onClick={signOut}>
              <LogOut size={15} strokeWidth={1.75} aria-hidden />
              <span className="hidden sm:inline">Sign out</span>
              <span className="sr-only sm:hidden">Sign out</span>
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1680px] px-4 pb-16 pt-6">{children}</main>
    </div>
    </SessionContext.Provider>
  );
}

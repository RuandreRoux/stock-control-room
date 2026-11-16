import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { Splash } from "@/components/Brand";
// Fonts are bundled with the app, so the build does not depend on fetching them from Google.
import "@fontsource-variable/montserrat/wght.css";
import "@fontsource-variable/open-sans/wght.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stock Control Room",
  description: "Daily document checks between physical stock movements and system stock.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-ZA">
      <body className="antialiased">
        <Suspense fallback={<Splash />}>
          <AppShell>{children}</AppShell>
        </Suspense>
      </body>
    </html>
  );
}

import Image from "next/image";
import logo from "@/assets/logo.png";
import mark from "@/assets/logo-mark.png";

/** The leaf mark, for tight spaces such as the top bar. */
export function LogoMark({ height = 36 }: { height?: number }) {
  return (
    <Image
      src={mark}
      alt=""
      height={height}
      width={Math.round((height * mark.width) / mark.height)}
      priority
    />
  );
}

/** The full Agri Technovation logo. Always sits on white. */
export function Logo({ width = 200 }: { width?: number }) {
  return (
    <Image
      src={logo}
      alt="Agri Technovation - Specialized to succeed"
      width={width}
      height={Math.round((width * logo.height) / logo.width)}
      priority
    />
  );
}

/** The illustrated fields behind the sign-in and loading screens, under the brand scrim. */
export function BrandBackdrop() {
  return (
    <>
      <div className="backdrop-drift absolute inset-0 bg-brand-900 bg-cover bg-center" style={{ backgroundImage: "url(/login-bg.svg)" }} />
      <div className="absolute inset-0 bg-[linear-gradient(100deg,rgba(0,61,33,.86),rgba(0,84,45,.6)_42%,rgba(0,104,56,0)_78%)]" />
    </>
  );
}

/** A thin moving bar: something is on its way. */
export function LoadingBar({ className = "" }: { className?: string }) {
  return (
    <div className={`h-1 overflow-hidden rounded-full bg-brand-100 ${className}`} role="progressbar" aria-label="Loading">
      <div className="loading-slide h-full w-1/3 rounded-full bg-brand" />
    </div>
  );
}

/** Shown inside a page while its data loads. */
export function Loading({ label }: { label: string }) {
  return (
    <div className="card mt-4 flex flex-col items-center px-4 py-12">
      <LogoMark height={56} />
      <p className="mt-3 font-display text-[14px] font-semibold text-ink-800">{label}</p>
      <LoadingBar className="mt-3 w-40" />
    </div>
  );
}

/** Full-screen splash shown while the app itself starts up. */
export function Splash() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-brand-900 px-4">
      <BrandBackdrop />
      <div className="relative flex w-full max-w-xs flex-col items-center rounded-xl bg-white px-8 py-8 shadow-modal">
        <Logo width={180} />
        <p className="mt-4 font-display text-[15px] font-bold text-ink-900">Stock Control Room</p>
        <LoadingBar className="mt-4 w-full" />
      </div>
    </div>
  );
}

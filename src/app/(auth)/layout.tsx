import Link from "next/link";
import { Logo } from "@/components/app/logo";
import { ThemeToggle } from "@/components/app/theme-toggle";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="relative flex flex-1 flex-col">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 bg-[radial-gradient(50%_60%_at_50%_0%,color-mix(in_oklch,var(--primary)_12%,transparent),transparent)]"
      />
      <header className="pt-safe">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link
            href="/"
            aria-label="Weekly Planner home"
            className="rounded-lg focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <Logo />
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main className="flex flex-1 flex-col items-center px-4 pt-6 pb-[calc(3rem+env(safe-area-inset-bottom))] sm:justify-center sm:pt-0">
        {children}
      </main>
    </div>
  );
}

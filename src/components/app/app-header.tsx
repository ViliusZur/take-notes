"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, History, Lock, LogOut, Settings, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api-client";
import type { MeDto } from "@/lib/api-types";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { useEncryption } from "@/components/encryption/encryption-provider";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";

const links: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/week", label: "Week", icon: CalendarDays },
  { href: "/history", label: "History", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isActive(pathname: string | null, href: string) {
  return pathname !== null && (pathname === href || pathname.startsWith(`${href}/`));
}

/** Social sign-ups start in UTC; adopt the browser's timezone once. */
function useTimezoneSync(me: MeDto | undefined) {
  const synced = useRef(false);
  useEffect(() => {
    if (!me || synced.current || me.timezone !== "UTC") return;
    const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!browserZone || browserZone === "UTC") return;
    synced.current = true;
    void api("/api/v1/me", { method: "PATCH", body: { timezone: browserZone } });
  }, [me]);
}

type NavProps = { pathname: string | null };

/** Pill tabs in the header, for tablets and desktops. */
function TopNav({ pathname }: NavProps) {
  return (
    <nav className="hidden items-center gap-1 rounded-full border bg-card/60 p-1 shadow-xs md:flex" aria-label="Main">
      {links.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
              active && "bg-primary/10 text-primary hover:text-primary",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** A tab bar at the bottom of the screen on phones, within reach of the thumb. */
function BottomNav({ pathname }: NavProps) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-(--header) pb-safe backdrop-blur-xl backdrop-saturate-150 md:hidden"
    >
      <div className="mx-auto grid h-16 max-w-md grid-cols-3">
        {links.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors focus-visible:outline-none",
                active && "text-primary",
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-14 items-center justify-center rounded-full transition-colors group-focus-visible:ring-[3px] group-focus-visible:ring-ring/50",
                  active && "bg-primary/12",
                )}
              >
                <Icon className="size-5" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
              </span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** The pathname is request data on dynamic routes, so it streams in behind Suspense. */
function WithPathname({ render }: { render: (pathname: string | null) => React.ReactNode }) {
  return render(usePathname());
}

function initials(name: string | undefined) {
  const letters = (name ?? "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return letters || "?";
}

export function AppHeader() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const encryption = useEncryption();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => api<MeDto>("/api/v1/me") });
  useTimezoneSync(me);
  const canLock = Boolean(encryption.status?.enabled && encryption.vault);

  async function signOut() {
    await encryption.lock();
    await authClient.signOut();
    // Nothing of this account stays in memory for whoever uses the browser next.
    queryClient.clear();
    router.push("/");
    router.refresh();
  }

  return (
    <>
      <header className="sticky top-0 z-30 border-b bg-(--header) pt-safe backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4 sm:px-6">
          <Link
            href="/week"
            className="mr-auto shrink-0 rounded-lg focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            aria-label="Weekly Planner, this week"
          >
            <Logo />
          </Link>
          <Suspense fallback={<TopNav pathname={null} />}>
            <WithPathname render={(pathname) => <TopNav pathname={pathname} />} />
          </Suspense>
          <div className="ml-auto flex items-center gap-1">
            {canLock && (
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground"
                onClick={() => void encryption.lock()}
                aria-label="Lock notebook"
                title="Lock your notebook now"
              >
                <Lock />
              </Button>
            )}
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Account"
                  className="ml-1 flex size-9 items-center justify-center rounded-full bg-primary/12 text-sm font-semibold text-primary transition-colors hover:bg-primary/18 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none sm:size-8 sm:text-xs"
                >
                  {initials(me?.name)}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="space-y-0.5 py-2 font-normal">
                  <span className="block truncate text-sm font-medium">{me?.name ?? "Account"}</span>
                  <span className="block truncate text-xs text-muted-foreground">{me?.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings">
                    <Settings aria-hidden /> Settings
                  </Link>
                </DropdownMenuItem>
                {canLock && (
                  <DropdownMenuItem onSelect={() => void encryption.lock()}>
                    <Lock aria-hidden /> Lock notebook
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={signOut}>
                  <LogOut aria-hidden /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <Suspense fallback={<BottomNav pathname={null} />}>
        <WithPathname render={(pathname) => <BottomNav pathname={pathname} />} />
      </Suspense>
    </>
  );
}

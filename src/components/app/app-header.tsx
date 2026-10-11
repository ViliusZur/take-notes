"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarDays, History, LogOut, Settings } from "lucide-react";
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
import { Logo } from "./logo";

const links = [
  { href: "/week", label: "Week", icon: CalendarDays },
  { href: "/history", label: "History", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
];

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

/** The pathname is request data on dynamic routes, so it streams in behind Suspense. */
function ActiveNavLinks() {
  return <NavLinks pathname={usePathname()} />;
}

function NavLinks({ pathname }: { pathname: string | null }) {
  return (
    <nav className="flex flex-1 items-center gap-1" aria-label="Main">
      {links.map(({ href, label, icon: Icon }) => {
        const active = pathname !== null && (pathname === href || pathname.startsWith(`${href}/`));
        return (
          <Button
            key={href}
            asChild
            variant="ghost"
            size="sm"
            className={cn(active && "bg-primary/12 text-primary hover:bg-primary/15 hover:text-primary")}
          >
            <Link href={href} aria-current={active ? "page" : undefined}>
              <Icon aria-hidden />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          </Button>
        );
      })}
    </nav>
  );
}

export function AppHeader() {
  const router = useRouter();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => api<MeDto>("/api/v1/me") });
  useTimezoneSync(me);

  async function signOut() {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-20 border-b bg-background/75 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-2 px-4 sm:px-6">
        <Link href="/week" className="mr-1 shrink-0 whitespace-nowrap sm:mr-3" aria-label="Weekly Planner, this week">
          <Logo nameClassName="hidden sm:inline" />
        </Link>
        <Suspense fallback={<NavLinks pathname={null} />}>
          <ActiveNavLinks />
        </Suspense>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="max-w-28 truncate sm:max-w-40">
              {me?.name ?? "Account"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="font-normal text-muted-foreground">{me?.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={signOut}>
              <LogOut aria-hidden /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

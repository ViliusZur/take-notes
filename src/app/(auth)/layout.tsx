import Link from "next/link";
import { Logo } from "@/components/app/logo";
import { ThemeToggle } from "@/components/app/theme-toggle";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="relative flex flex-1 flex-col items-center justify-center gap-6 px-4 py-12">
      <ThemeToggle className="absolute top-4 right-4" />
      <Link href="/" aria-label="Weekly Planner home">
        <Logo />
      </Link>
      {children}
    </main>
  );
}

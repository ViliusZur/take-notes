import Link from "next/link";
import { Logo } from "@/components/app/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-12">
      <Link href="/" aria-label="Weekly Planner home">
        <Logo />
      </Link>
      {children}
    </main>
  );
}

import { cn } from "@/lib/utils";

/** The app mark (same artwork as the tab icon) with the wordmark. */
export function Logo({ className, nameClassName }: { className?: string; nameClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.svg" alt="" width={28} height={28} className="size-7 shrink-0 rounded-[9px] shadow-xs" />
      <span className={cn("text-[15px] font-semibold tracking-tight", nameClassName)}>Weekly Planner</span>
    </span>
  );
}

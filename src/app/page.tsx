import { ArrowRight, CalendarDays, Check, NotebookPen, PhoneCall } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/app/logo";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { toneClasses, type Tone } from "@/components/planner/tone";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const features: { icon: typeof PhoneCall; tone: Tone; title: string; body: string }[] = [
  {
    icon: PhoneCall,
    tone: "violet",
    title: "A Sunday call that plans your week",
    body: "At the time you choose, an AI assistant calls, asks about next week, and writes the plan into your notebook.",
  },
  {
    icon: NotebookPen,
    tone: "amber",
    title: "Your whole week on one screen",
    body: "Big picture, a weekly to-do list, a plan for every day, and a page of notes. Made for your phone.",
  },
  {
    icon: CalendarDays,
    tone: "teal",
    title: "History without scorekeeping",
    body: "Look back at what got done, what you skipped and why, and what you were aiming for.",
  },
];

/** A static, decorative sketch of the planner. */
function Preview() {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const tasks = [
    { title: "Review the launch checklist", done: true },
    { title: "Gym, upper body", done: true },
    { title: "Call mom about the weekend", done: false },
  ];
  return (
    <div aria-hidden className="mx-auto w-full max-w-md select-none">
      <div className="rounded-[1.75rem] border bg-card p-4 shadow-xl shadow-primary/5 sm:p-5">
        <p className="text-xs font-medium text-primary">This week</p>
        <p className="text-2xl font-semibold tracking-tight">Week 46</p>
        <div className="mt-4 grid grid-cols-7 gap-1 rounded-2xl bg-muted/60 p-2">
          {days.map((day, index) => (
            <div key={day} className="flex flex-col items-center gap-1 py-1">
              <span className="text-[10px] text-muted-foreground">{day}</span>
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-full text-sm font-semibold",
                  index === 3 && "bg-primary text-primary-foreground",
                )}
              >
                {9 + index}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-2xl border p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold">To do this week</span>
            <span className="text-xs text-muted-foreground">2 of 3 done</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-2/3 rounded-full bg-success" />
          </div>
          <ul className="mt-2 space-y-0.5">
            {tasks.map((task) => (
              <li key={task.title} className="flex items-center gap-3 py-1.5 text-sm">
                <span
                  className={cn(
                    "flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px]",
                    task.done ? "border-success bg-success text-white" : "border-input",
                  )}
                >
                  {task.done && <Check className="size-3 stroke-3" />}
                </span>
                <span className={cn(task.done && "text-muted-foreground line-through")}>{task.title}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="relative flex flex-1 flex-col overflow-x-clip">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[40rem] bg-[radial-gradient(50%_60%_at_50%_0%,color-mix(in_oklch,var(--primary)_16%,transparent),transparent)]"
      />
      <header className="pt-safe">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button asChild variant="ghost" size="sm" className="max-sm:hidden">
              <Link href="/sign-in">Sign in</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-[calc(3rem+env(safe-area-inset-bottom))] sm:px-6">
        <section className="pt-8 pb-12 text-center sm:pt-20 sm:pb-16">
          <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium shadow-xs">
            <PhoneCall className="size-3.5 text-primary" aria-hidden />
            An AI planning call every Sunday
          </span>
          <h1 className="mx-auto mt-5 max-w-3xl text-[2.5rem] leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl">
            Plan next week in a <span className="text-primary">five-minute</span> phone call.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-pretty text-muted-foreground sm:text-lg">
            A weekly planning notebook for your direction, tasks, and notes, with an AI that calls you on Sunday and
            drafts the week for you.
          </p>
          <div className="mx-auto mt-8 flex max-w-sm flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
            <Button asChild size="lg" className="shadow-lg shadow-primary/20">
              <Link href="/sign-up">
                Create an account <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/sign-in">Sign in</Link>
            </Button>
          </div>
        </section>

        <Preview />

        <ul className="mt-14 grid gap-3 sm:mt-20 sm:grid-cols-3 sm:gap-4">
          {features.map(({ icon: Icon, tone, title, body }) => (
            <li key={title} className="flex gap-4 rounded-2xl border bg-card p-4 shadow-xs sm:flex-col sm:gap-3 sm:p-5">
              <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", toneClasses(tone))}>
                <Icon className="size-5" aria-hidden />
              </span>
              <div className="space-y-1">
                <h2 className="text-[15px] leading-snug font-semibold">{title}</h2>
                <p className="text-sm text-muted-foreground">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}

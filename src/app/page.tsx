import { CalendarDays, NotebookPen, PhoneCall } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/app/logo";
import { Marker, toneClasses, type Tone } from "@/components/planner/marker";
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
    tone: "yellow",
    title: "A weekly spread, faster than paper",
    body: "Big picture, a weekly to-do list, a plan for every day, and a page of notes, side by side.",
  },
  {
    icon: CalendarDays,
    tone: "teal",
    title: "History without scorekeeping",
    body: "Look back at what got done, what you skipped and why, and what you were aiming for.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-14 px-4 py-16 sm:px-6">
      <div className="space-y-6">
        <Logo />
        <h1 className="max-w-3xl font-display text-4xl leading-[1.1] font-bold tracking-tight sm:text-6xl">
          Plan next week in a{" "}
          <span className="relative inline-block">
            <span className="absolute inset-x-[-0.15em] bottom-[0.08em] h-[0.45em] -rotate-1 rounded-sm bg-hl-yellow" aria-hidden />
            <span className="relative">five-minute</span>
          </span>{" "}
          phone call.
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          A weekly planning notebook for your direction, tasks, and notes, with an AI that calls you on Sunday and
          drafts the week for you.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg" className="shadow-md shadow-primary/25">
            <Link href="/sign-up">Create an account</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/sign-in">Sign in</Link>
          </Button>
        </div>
      </div>
      <ul className="grid gap-4 sm:grid-cols-3">
        {features.map(({ icon: Icon, tone, title, body }) => (
          <li key={title} className="paper-grid space-y-3 rounded-2xl border bg-card p-5 shadow-sm">
            <span className={cn("inline-flex size-10 items-center justify-center rounded-xl", toneClasses(tone))}>
              <Icon className="size-5" aria-hidden />
            </span>
            <h2 className="font-display text-lg leading-snug font-semibold">{title}</h2>
            <p className="text-sm text-muted-foreground">{body}</p>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">
        Built like a paper planner: <Marker tone="coral" className="text-lg">big picture</Marker>,{" "}
        <Marker tone="sky" className="text-lg">weekly to do</Marker>, <Marker tone="lime" className="text-lg">notes</Marker>.
      </p>
    </main>
  );
}

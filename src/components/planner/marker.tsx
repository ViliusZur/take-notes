import { cn } from "@/lib/utils";

const TONES = {
  yellow: "bg-hl-yellow text-hl-yellow-fg",
  green: "bg-hl-green text-hl-green-fg",
  sky: "bg-hl-sky text-hl-sky-fg",
  violet: "bg-hl-violet text-hl-violet-fg",
  pink: "bg-hl-pink text-hl-pink-fg",
  orange: "bg-hl-orange text-hl-orange-fg",
  teal: "bg-hl-teal text-hl-teal-fg",
  coral: "bg-hl-coral text-hl-coral-fg",
  lime: "bg-hl-lime text-hl-lime-fg",
} as const;

export type Tone = keyof typeof TONES;

/** Day headings and day badges all use the yellow highlighter, like the paper planner. */
export const DAY_TONE: Tone = "yellow";

const CYCLE: Tone[] = ["yellow", "green", "sky", "violet", "pink", "orange", "teal"];

/** A repeating color for lists, e.g. one per week in History. */
export function toneAt(index: number): Tone {
  return CYCLE[((index % CYCLE.length) + CYCLE.length) % CYCLE.length];
}

export function toneClasses(tone: Tone) {
  return TONES[tone];
}

/** A highlighter-style label, like the headings in a paper planner. */
export function Marker({ tone, className, children }: { tone: Tone; className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-block w-fit -rotate-[0.6deg] rounded-[4px_10px_5px_12px/8px_5px_10px_4px] px-2 pt-0.5 font-hand text-[1.35rem] leading-tight font-bold",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

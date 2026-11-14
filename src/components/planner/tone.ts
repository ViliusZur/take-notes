const TONES = {
  amber: "bg-tone-amber text-tone-amber-fg",
  green: "bg-tone-green text-tone-green-fg",
  sky: "bg-tone-sky text-tone-sky-fg",
  violet: "bg-tone-violet text-tone-violet-fg",
  pink: "bg-tone-pink text-tone-pink-fg",
  orange: "bg-tone-orange text-tone-orange-fg",
  teal: "bg-tone-teal text-tone-teal-fg",
} as const;

/** A soft tinted color for icon tiles and chips. */
export type Tone = keyof typeof TONES;

export function toneClasses(tone: Tone) {
  return TONES[tone];
}

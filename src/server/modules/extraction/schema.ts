import { z } from "zod";
import { WEEKDAYS } from "@/lib/weeks";

export const extractedPlanSchema = z.object({
  planCaptured: z
    .boolean()
    .describe("False when the caller never described any plan, e.g. they hung up or asked to talk another time."),
  userAskedToStopCalls: z.boolean().describe("True only if the caller clearly asked to stop receiving these calls."),
  bigPictureDirection: z
    .string()
    .nullable()
    .describe("One or two sentences in the caller's own words about the overall focus for the week, or null."),
  tasks: z.array(
    z.object({
      title: z.string().describe("Short imperative task title, e.g. 'Finish signup screens'."),
      day: z.enum(WEEKDAYS).nullable().describe("Day the caller tied the task to, or null if any day."),
      carriedOverFromTaskId: z
        .string()
        .nullable()
        .describe("Id from unfinishedTasks when the caller carries that task over, otherwise null."),
    }),
  ),
  dayItems: z.array(
    z.object({
      day: z.enum(WEEKDAYS),
      text: z.string().describe("Appointment or reminder for that day, e.g. 'Dentist at 16:00'."),
    }),
  ),
  weekNotes: z
    .string()
    .nullable()
    .describe("Anything else worth writing down for the week that is not a task or tied to a day, or null."),
  callSummary: z.string().describe("Two or three neutral sentences summarizing the call for the call history."),
});

export type ExtractedPlan = z.infer<typeof extractedPlanSchema>;

export type ExtractionInput = {
  transcript: string;
  callerFirstName: string;
  /** The week being planned. */
  targetWeek: { label: string; days: { weekday: string; date: string }[] };
  currentWeekDirection: string;
  unfinishedTasks: { id: string; title: string; status: "open" | "skipped"; skippedReason: string | null }[];
  existingTargetWeekTaskTitles: string[];
};

export type PlanExtractor = (input: ExtractionInput) => Promise<ExtractedPlan>;

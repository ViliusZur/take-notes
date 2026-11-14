import type { NotebookContentDto, TaskDto, WeekDto, WeekSummaryDto } from "@/lib/api-types";
import type { ContentCodec } from "@/lib/encryption";

/** Converts the content fields of API shapes between their stored form and plain text. */

export async function decodeTask(codec: ContentCodec, task: TaskDto): Promise<TaskDto> {
  if (!codec.encrypted) return task;
  return {
    ...task,
    title: await codec.decode("task.title", task.title),
    skippedReason: task.skippedReason === null ? null : await codec.decode("task.skippedReason", task.skippedReason),
  };
}

export async function decodeWeek(codec: ContentCodec, week: WeekDto): Promise<WeekDto> {
  if (!codec.encrypted) return week;
  const [bigPictureDirection, notes, tasks] = await Promise.all([
    codec.decode("week.direction", week.bigPictureDirection),
    codec.decode("week.notes", week.notes),
    Promise.all(week.tasks.map((task) => decodeTask(codec, task))),
  ]);
  return { ...week, bigPictureDirection, notes, tasks };
}

export async function decodeWeekSummaries(codec: ContentCodec, weeks: WeekSummaryDto[]): Promise<WeekSummaryDto[]> {
  if (!codec.encrypted) return weeks;
  return Promise.all(
    weeks.map(async (week) => ({
      ...week,
      bigPictureDirection: await codec.decode("week.direction", week.bigPictureDirection),
    })),
  );
}

type TaskContent = { title?: string; skippedReason?: string | null };

export async function encodeTaskContent<T extends TaskContent>(codec: ContentCodec, input: T): Promise<T> {
  if (!codec.encrypted) return input;
  const encoded = { ...input };
  if (input.title !== undefined) encoded.title = await codec.encode("task.title", input.title);
  if (input.skippedReason) encoded.skippedReason = await codec.encode("task.skippedReason", input.skippedReason);
  return encoded;
}

/** Re-encodes a whole notebook: `from` reads what is stored now, `to` writes the new stored form. */
export async function convertNotebook(
  content: NotebookContentDto,
  from: ContentCodec,
  to: ContentCodec,
): Promise<NotebookContentDto> {
  const convert = async (field: Parameters<ContentCodec["encode"]>[0], value: string) =>
    to.encode(field, await from.decode(field, value));
  return {
    weeks: await Promise.all(
      content.weeks.map(async (week) => ({
        ...week,
        bigPictureDirection: await convert("week.direction", week.bigPictureDirection),
        notes: await convert("week.notes", week.notes),
      })),
    ),
    tasks: await Promise.all(
      content.tasks.map(async (task) => ({
        ...task,
        title: await convert("task.title", task.title),
        skippedReason: task.skippedReason === null ? null : await convert("task.skippedReason", task.skippedReason),
      })),
    ),
  };
}

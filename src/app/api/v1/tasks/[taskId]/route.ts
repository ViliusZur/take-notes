import { z } from "zod";
import { TASK_STATUSES } from "@/server/db/schema";
import { ifMatchVersion, json, notFound, parseJson, requireUser, route, unlockProof } from "@/server/http";
import { deleteTask, updateTask } from "@/server/modules/planner/service";
import { isoDate, skippedReason, taskTitle } from "@/server/validation";

type Context = RouteContext<"/api/v1/tasks/[taskId]">;

const patchSchema = z.object({
  title: taskTitle.optional(),
  assignedDate: isoDate.nullable().optional(),
  status: z.enum(TASK_STATUSES).optional(),
  skippedReason: skippedReason.nullable().optional(),
  /** Where the task lands in one of its lists, e.g. after dragging it. */
  place: z
    .object({ list: z.enum(["weekly", "day"]), before: z.uuid().nullable() })
    .optional(),
});

async function taskIdFrom(context: Context) {
  const { taskId } = await context.params;
  if (!z.uuid().safeParse(taskId).success) throw notFound("Task");
  return taskId;
}

export const PATCH = route<Context>(async (request, context) => {
  const user = await requireUser();
  const taskId = await taskIdFrom(context);
  const patch = await parseJson(request, patchSchema);
  const task = await updateTask(user.id, taskId, patch, ifMatchVersion(request), unlockProof(request));
  return json(task);
});

export const DELETE = route<Context>(async (request, context) => {
  const user = await requireUser();
  await deleteTask(user.id, await taskIdFrom(context), unlockProof(request));
  return new Response(null, { status: 204 });
});

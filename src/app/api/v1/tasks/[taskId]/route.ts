import { z } from "zod";
import { TASK_STATUSES } from "@/server/db/schema";
import { ifMatchVersion, json, notFound, parseJson, requireUser, route } from "@/server/http";
import { deleteTask, updateTask } from "@/server/modules/planner/service";
import { isoDate, taskTitle } from "@/server/validation";

type Context = RouteContext<"/api/v1/tasks/[taskId]">;

const patchSchema = z.object({
  title: taskTitle.optional(),
  assignedDate: isoDate.nullable().optional(),
  status: z.enum(TASK_STATUSES).optional(),
  skippedReason: z.string().trim().max(500).nullable().optional(),
  position: z.number().int().min(0).optional(),
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
  const task = await updateTask(user.id, taskId, patch, ifMatchVersion(request));
  return json(task);
});

export const DELETE = route<Context>(async (_request, context) => {
  const user = await requireUser();
  await deleteTask(user.id, await taskIdFrom(context));
  return new Response(null, { status: 204 });
});

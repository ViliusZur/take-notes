import { z } from "zod";
import { TASK_KINDS } from "@/server/db/schema";
import { json, parseJson, requireUser, route } from "@/server/http";
import { createTask } from "@/server/modules/planner/service";
import { isoDate, taskTitle, weekKeyFromParams } from "@/server/validation";

const postSchema = z.object({
  title: taskTitle,
  assignedDate: isoDate.nullable().optional(),
  kind: z.enum(TASK_KINDS).optional(),
});

export const POST = route<RouteContext<"/api/v1/years/[isoYear]/weeks/[isoWeek]/tasks">>(
  async (request, context) => {
    const user = await requireUser();
    const key = weekKeyFromParams(await context.params);
    const input = await parseJson(request, postSchema);
    const task = await createTask(user.id, key, input);
    return json(task, { status: 201, version: task.version });
  },
);

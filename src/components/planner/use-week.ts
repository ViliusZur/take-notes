"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import type { TaskDto, WeekDto, WeekNotesDto } from "@/lib/api-types";
import type { WeekKey } from "@/lib/weeks";

export function weekQueryKey({ isoYear, isoWeek }: WeekKey) {
  return ["week", isoYear, isoWeek] as const;
}

function weekUrl({ isoYear, isoWeek }: WeekKey) {
  return `/api/v1/years/${isoYear}/weeks/${isoWeek}`;
}

export function useWeek(initialWeek: WeekDto) {
  const key = { isoYear: initialWeek.isoYear, isoWeek: initialWeek.isoWeek };
  return useQuery({
    queryKey: weekQueryKey(key),
    queryFn: () => api<WeekDto>(weekUrl(key)),
    initialData: initialWeek,
  });
}

export type TaskPatch = Partial<Pick<TaskDto, "title" | "assignedDate" | "status" | "skippedReason" | "position">>;

/**
 * Every write to a week runs in one mutation scope, so writes reach the server in order
 * and each one reads the latest version (for `If-Match`) from the cache when it runs.
 */
export function useWeekActions(key: WeekKey) {
  const queryClient = useQueryClient();
  const queryKey = weekQueryKey(key);
  const scope = { id: `week-${key.isoYear}-${key.isoWeek}` };

  const current = () => queryClient.getQueryData<WeekDto>(queryKey);
  const setWeek = (update: (week: WeekDto) => WeekDto) =>
    queryClient.setQueryData<WeekDto>(queryKey, (week) => (week ? update(week) : week));
  const replaceTask = (task: TaskDto) =>
    setWeek((week) => ({ ...week, tasks: week.tasks.map((t) => (t.id === task.id ? task : t)) }));

  const handleError = (error: unknown) => {
    if (error instanceof ApiError && error.isConflict) {
      toast.info("This changed somewhere else, so we refreshed it.");
    } else {
      toast.error(errorMessage(error));
    }
    void queryClient.invalidateQueries({ queryKey });
  };

  const createTask = useMutation({
    scope,
    mutationFn: ({ input }: { input: { title: string; assignedDate: string | null }; tempId: string }) =>
      api<TaskDto>(`${weekUrl(key)}/tasks`, { method: "POST", body: input }),
    onMutate: async ({ input, tempId }) => {
      await queryClient.cancelQueries({ queryKey });
      setWeek((week) => ({
        ...week,
        tasks: [
          ...week.tasks,
          {
            id: tempId,
            title: input.title,
            kind: input.assignedDate ? "ad_hoc" : "weekly",
            assignedDate: input.assignedDate,
            status: "open",
            skippedReason: null,
            position: Number.MAX_SAFE_INTEGER,
            version: 0,
            callId: null,
            carriedOverFromTaskId: null,
          },
        ],
      }));
    },
    onSuccess: (task, { tempId }) =>
      setWeek((week) => ({
        ...week,
        version: Math.max(week.version, 1),
        tasks: week.tasks.map((t) => (t.id === tempId ? task : t)),
      })),
    onError: (error, { tempId }) => {
      setWeek((week) => ({ ...week, tasks: week.tasks.filter((t) => t.id !== tempId) }));
      handleError(error);
    },
  });

  const updateTask = useMutation({
    scope,
    mutationFn: ({ taskId, patch }: { taskId: string; patch: TaskPatch }) => {
      const version = current()?.tasks.find((t) => t.id === taskId)?.version;
      return api<TaskDto>(`/api/v1/tasks/${taskId}`, { method: "PATCH", body: patch, version });
    },
    onMutate: async ({ taskId, patch }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = current()?.tasks.find((t) => t.id === taskId);
      setWeek((week) => ({
        ...week,
        tasks: week.tasks.map((t) => (t.id === taskId ? { ...t, ...patch, version: t.version } : t)),
      }));
      return { previous };
    },
    onSuccess: replaceTask,
    onError: (error, _variables, context) => {
      if (context?.previous) replaceTask(context.previous);
      handleError(error);
    },
  });

  const deleteTask = useMutation({
    scope,
    mutationFn: (taskId: string) => api<void>(`/api/v1/tasks/${taskId}`, { method: "DELETE" }),
    onMutate: async (taskId) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = current()?.tasks;
      setWeek((week) => ({ ...week, tasks: week.tasks.filter((t) => t.id !== taskId) }));
      return { previous };
    },
    onError: (error, _taskId, context) => {
      if (context?.previous) setWeek((week) => ({ ...week, tasks: context.previous! }));
      handleError(error);
    },
  });

  const setDirection = useMutation({
    scope,
    mutationFn: (bigPictureDirection: string) =>
      api<WeekDto>(weekUrl(key), { method: "PUT", body: { bigPictureDirection }, version: current()?.version }),
    onSuccess: (week) =>
      setWeek((cached) => ({ ...cached, bigPictureDirection: week.bigPictureDirection, version: week.version })),
    onError: handleError,
  });

  const setNotes = useMutation({
    scope,
    mutationFn: (notes: string) =>
      api<WeekNotesDto>(`${weekUrl(key)}/notes`, { method: "PUT", body: { notes }, version: current()?.notesVersion }),
    onSuccess: (saved) => setWeek((week) => ({ ...week, ...saved, version: Math.max(week.version, 1) })),
    onError: (error) => {
      if (error instanceof ApiError && error.isConflict) {
        // The draft stays in the editor; the next save writes it over the newer version.
        toast.info("These notes changed on another device. Your text is kept and saves over it.");
        void queryClient.invalidateQueries({ queryKey });
      } else {
        handleError(error);
      }
    },
  });

  const undoCallImport = useMutation({
    mutationFn: (callId: string) => api(`/api/v1/calls/${callId}/plan-import`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Removed everything the call added.");
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ["calls"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return {
    createTask: (input: { title: string; assignedDate: string | null }) =>
      createTask.mutate({ input, tempId: `temp-${crypto.randomUUID()}` }),
    updateTask: (taskId: string, patch: TaskPatch) => updateTask.mutate({ taskId, patch }),
    deleteTask: (taskId: string) => deleteTask.mutate(taskId),
    setDirection: (value: string) => setDirection.mutateAsync(value),
    setNotes: (notes: string) => setNotes.mutateAsync(notes),
    undoCallImport: (callId: string) => undoCallImport.mutate(callId),
    undoPending: undoCallImport.isPending,
  };
}

export type WeekActions = ReturnType<typeof useWeekActions>;

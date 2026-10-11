import { describe, expect, it } from "vitest";
import { createTask, getWeek, setDirection, setNotes, updateTask } from "@/server/modules/planner/service";
import { createUser } from "./helpers";

const week = { isoYear: 2026, isoWeek: 42 };

describe("planner", () => {
  it("returns an empty, unsaved week", async () => {
    const owner = await createUser();
    const view = await getWeek(owner.id, week);
    expect(view).toMatchObject({ version: 0, notesVersion: 0, tasks: [], notes: "", bigPictureDirection: "" });
    expect(view.dates[0]).toBe("2026-10-12");
  });

  it("creates weekly and day tasks in order", async () => {
    const owner = await createUser();
    await createTask(owner.id, week, { title: "Write investor update" });
    await createTask(owner.id, week, { title: "Dentist", assignedDate: "2026-10-15" });
    const view = await getWeek(owner.id, week);
    expect(view.tasks.map((task) => [task.title, task.kind, task.assignedDate, task.position])).toEqual([
      ["Write investor update", "weekly", null, 0],
      ["Dentist", "ad_hoc", "2026-10-15", 1],
    ]);
  });

  it("rejects a day outside the week", async () => {
    const owner = await createUser();
    await expect(createTask(owner.id, week, { title: "Nope", assignedDate: "2026-10-19" })).rejects.toMatchObject({
      status: 422,
    });
  });

  it("detects concurrent task edits with versions", async () => {
    const owner = await createUser();
    const task = await createTask(owner.id, week, { title: "Ship onboarding" });
    const done = await updateTask(owner.id, task.id, { status: "done" }, task.version);
    expect(done.version).toBe(2);
    await expect(updateTask(owner.id, task.id, { title: "Stale edit" }, task.version)).rejects.toMatchObject({
      status: 412,
    });
  });

  it("keeps skipped reasons only on skipped tasks", async () => {
    const owner = await createUser();
    const task = await createTask(owner.id, week, { title: "Gym" });
    const skipped = await updateTask(owner.id, task.id, { status: "skipped", skippedReason: "Sick" }, undefined);
    expect(skipped.skippedReason).toBe("Sick");
    const reopened = await updateTask(owner.id, task.id, { status: "open" }, undefined);
    expect(reopened.skippedReason).toBeNull();
    await expect(updateTask(owner.id, task.id, { skippedReason: "x" }, undefined)).rejects.toMatchObject({
      status: 422,
    });
  });

  it("does not let one user touch another user's task", async () => {
    const owner = await createUser();
    const intruder = await createUser();
    const task = await createTask(owner.id, week, { title: "Private" });
    await expect(updateTask(intruder.id, task.id, { title: "Hijack" }, undefined)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("versions direction and notes", async () => {
    const owner = await createUser();
    const first = await setDirection(owner.id, week, "Ship onboarding", 0);
    expect(first).toMatchObject({ bigPictureDirection: "Ship onboarding", version: 2 });
    await expect(setDirection(owner.id, week, "Other", 0)).rejects.toMatchObject({ status: 412 });

    // Notes have their own version: editing them never conflicts with the direction.
    const notes = await setNotes(owner.id, week, "Call Anna", 0);
    expect(notes).toEqual({ notes: "Call Anna", notesVersion: 2 });
    const edited = await setNotes(owner.id, week, "Call Anna at 10", notes.notesVersion);
    expect(edited).toEqual({ notes: "Call Anna at 10", notesVersion: 3 });
    await expect(setNotes(owner.id, week, "Stale", notes.notesVersion)).rejects.toMatchObject({ status: 412 });
    expect(await getWeek(owner.id, week)).toMatchObject({
      bigPictureDirection: "Ship onboarding",
      version: 2,
      notes: "Call Anna at 10",
      notesVersion: 3,
    });
  });
});

import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { createTask, getWeek, updateTask } from "@/server/modules/planner/service";
import { dayList, moveTask, PlacementError, weeklyList, type OrderedTask } from "@/lib/task-order";
import { createUser } from "./helpers";

const week = { isoYear: 2026, isoWeek: 42 };
const TUE = "2026-10-13";
const WED = "2026-10-14";

function task(id: string, kind: "weekly" | "ad_hoc", assignedDate: string | null, position: number, dayPosition = position) {
  return { id, kind, assignedDate, position, dayPosition } satisfies OrderedTask;
}

const ids = (tasks: OrderedTask[]) => tasks.map((t) => t.id);

describe("moveTask", () => {
  const tasks = [
    task("a", "weekly", null, 0),
    task("b", "weekly", TUE, 1),
    task("c", "ad_hoc", TUE, 2),
    task("d", "weekly", null, 3),
    task("e", "ad_hoc", TUE, 4),
  ];

  it("reorders within the weekly list without touching day order", () => {
    const moved = moveTask(tasks, "d", { place: { list: "weekly", before: "a" } });
    expect(ids(weeklyList(moved))).toEqual(["d", "a", "b"]);
    expect(ids(dayList(moved, TUE))).toEqual(["b", "c", "e"]);
  });

  it("reorders within a day without touching the weekly order", () => {
    const moved = moveTask(tasks, "b", { place: { list: "day", before: null } });
    expect(ids(dayList(moved, TUE))).toEqual(["c", "e", "b"]);
    expect(ids(weeklyList(moved))).toEqual(["a", "b", "d"]);
  });

  it("drops a task into another list at the exact spot", () => {
    const toDay = moveTask(tasks, "a", { assignedDate: TUE, place: { list: "day", before: "c" } });
    expect(ids(dayList(toDay, TUE))).toEqual(["b", "a", "c", "e"]);
    expect(ids(weeklyList(toDay))).toEqual(["a", "b", "d"]);

    const toWeekly = moveTask(tasks, "e", { assignedDate: null, place: { list: "weekly", before: "b" } });
    expect(ids(weeklyList(toWeekly))).toEqual(["a", "e", "b", "d"]);
    expect(ids(dayList(toWeekly, TUE))).toEqual(["b", "c"]);
  });

  it("puts a task at the bottom of a list it joins without a spot", () => {
    const planned = moveTask(tasks, "a", { assignedDate: TUE });
    expect(ids(dayList(planned, TUE))).toEqual(["b", "c", "e", "a"]);
    const unplanned = moveTask(tasks, "c", { assignedDate: null });
    expect(ids(weeklyList(unplanned))).toEqual(["a", "b", "d", "c"]);
  });

  it("lands at the end when the spot's task is gone", () => {
    const moved = moveTask(tasks, "a", { place: { list: "weekly", before: "zzz" } });
    expect(ids(weeklyList(moved))).toEqual(["b", "d", "a"]);
  });

  it("refuses a spot in a list the task isn't in", () => {
    expect(() => moveTask(tasks, "c", { place: { list: "weekly", before: null } })).toThrow(PlacementError);
    expect(() => moveTask(tasks, "a", { place: { list: "day", before: null } })).toThrow(PlacementError);
  });
});

describe("moving tasks", () => {
  async function seed() {
    const owner = await createUser();
    const a = await createTask(owner.id, week, { title: "A" });
    const b = await createTask(owner.id, week, { title: "B" });
    const c = await createTask(owner.id, week, { title: "C", assignedDate: TUE });
    const d = await createTask(owner.id, week, { title: "D", assignedDate: TUE });
    await updateTask(owner.id, b.id, { assignedDate: TUE }, undefined);
    return { owner, a, b, c, d };
  }

  async function lists(userId: string) {
    const { tasks } = await getWeek(userId, week);
    const title = (list: OrderedTask[]) => list.map((t) => tasks.find((x) => x.id === t.id)!.title);
    return { weekly: title(weeklyList(tasks)), tue: title(dayList(tasks, TUE)), wed: title(dayList(tasks, WED)) };
  }

  it("plans a task for a day at the bottom of that day", async () => {
    const { owner } = await seed();
    expect(await lists(owner.id)).toEqual({ weekly: ["A", "B"], tue: ["C", "D", "B"], wed: [] });
  });

  it("saves the order of each list separately", async () => {
    const { owner, a, b, c } = await seed();
    await updateTask(owner.id, b.id, { place: { list: "weekly", before: a.id } }, undefined);
    expect(await lists(owner.id)).toMatchObject({ weekly: ["B", "A"], tue: ["C", "D", "B"] });
    await updateTask(owner.id, b.id, { place: { list: "day", before: c.id } }, undefined);
    expect(await lists(owner.id)).toMatchObject({ weekly: ["B", "A"], tue: ["B", "C", "D"] });
  });

  it("moves a task between days to the exact spot, keeping other tasks' versions", async () => {
    const { owner, c, d } = await seed();
    await updateTask(owner.id, c.id, { assignedDate: WED }, undefined);
    await updateTask(owner.id, d.id, { assignedDate: WED, place: { list: "day", before: c.id } }, undefined);
    expect(await lists(owner.id)).toMatchObject({ tue: ["B"], wed: ["D", "C"] });
    const { tasks } = await getWeek(owner.id, week);
    expect(tasks.find((t) => t.id === c.id)?.version).toBe(2);
  });

  it("clears the day of a task dropped on the weekly list", async () => {
    const { owner, a, d } = await seed();
    const moved = await updateTask(owner.id, d.id, { assignedDate: null, place: { list: "weekly", before: a.id } }, undefined);
    expect(moved.assignedDate).toBeNull();
    expect(await lists(owner.id)).toMatchObject({ weekly: ["D", "A", "B"], tue: ["C", "B"] });
  });

  it("refuses a spot in a list the task isn't in", async () => {
    const { owner, c } = await seed();
    await expect(updateTask(owner.id, c.id, { place: { list: "weekly", before: null } }, undefined)).rejects.toMatchObject({
      status: 422,
    });
  });
});

describe("0003_task_day_position migration", () => {
  it("starts each task's day order from its old position", async () => {
    const db = new PGlite();
    for (const name of ["0000_init.sql", "0001_week_notes.sql", "0002_encryption.sql"]) {
      const sql = readFileSync(path.join(process.cwd(), "drizzle", name), "utf8");
      for (const statement of sql.split("--> statement-breakpoint")) if (statement.trim()) await db.exec(statement);
    }
    await db.exec(`
      insert into "user" (id, name, email) values ('u1', 'Jane', 'jane@example.com');
      insert into weeks (id, user_id, iso_year, iso_week, week_start_date)
        values ('00000000-0000-0000-0000-000000000001', 'u1', 2026, 42, '2026-10-12');
      insert into tasks (week_id, title, position) values
        ('00000000-0000-0000-0000-000000000001', 'A', 0),
        ('00000000-0000-0000-0000-000000000001', 'B', 5);
    `);
    const sql = readFileSync(path.join(process.cwd(), "drizzle", "0003_task_day_position.sql"), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) if (statement.trim()) await db.exec(statement);
    const { rows } = await db.query("select title, position, day_position from tasks order by title");
    expect(rows).toEqual([
      { title: "A", position: 0, day_position: 0 },
      { title: "B", position: 5, day_position: 5 },
    ]);
    await db.close();
  });
});

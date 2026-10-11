import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

async function runMigrationFile(db: PGlite, name: string) {
  const sql = readFileSync(path.join(process.cwd(), "drizzle", name), "utf8");
  for (const statement of sql.split("--> statement-breakpoint")) {
    if (statement.trim()) await db.exec(statement);
  }
}

describe("0001_week_notes migration", () => {
  it("moves existing day notes into the week's notes before dropping them", async () => {
    const db = new PGlite();
    await runMigrationFile(db, "0000_init.sql");

    await db.exec(`
      insert into "user" (id, name, email) values ('u1', 'Jane', 'jane@example.com');
      insert into weeks (id, user_id, iso_year, iso_week, week_start_date)
        values ('00000000-0000-0000-0000-000000000001', 'u1', 2026, 42, '2026-10-12'),
               ('00000000-0000-0000-0000-000000000002', 'u1', 2026, 43, '2026-10-19');
      insert into daily_notes (week_id, note_date, body) values
        ('00000000-0000-0000-0000-000000000001', '2026-10-15', 'Dentist at 16:00'),
        ('00000000-0000-0000-0000-000000000001', '2026-10-12', 'Call Anna'),
        ('00000000-0000-0000-0000-000000000001', '2026-10-13', '   ');
    `);

    await runMigrationFile(db, "0001_week_notes.sql");

    const { rows } = await db.query<{ iso_week: number; notes: string; notes_version: number }>(
      "select iso_week, notes, notes_version from weeks order by iso_week",
    );
    expect(rows).toEqual([
      { iso_week: 42, notes: "Mon 12\nCall Anna\n\nThu 15\nDentist at 16:00", notes_version: 1 },
      { iso_week: 43, notes: "", notes_version: 1 },
    ]);
    const { rows: tables } = await db.query("select 1 from information_schema.tables where table_name = 'daily_notes'");
    expect(tables).toHaveLength(0);
    await db.close();
  });
});

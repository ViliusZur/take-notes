import { beforeAll } from "vitest";
import { runMigrations } from "@/server/db/migrate";

beforeAll(async () => {
  await runMigrations();
});

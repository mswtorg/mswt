import { pipeline } from "node:stream/promises";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Move from stage tests: a second throwaway database playing "stage", next to the test database
// playing "production" (local Postgres or the CI service container; never Neon).

/** The "stage" database: the test database's name + "_stage". */
export function stageUrlFor(url: string) {
  const u = new URL(url);
  if (u.hostname.endsWith(".neon.tech")) throw new Error("Stage tests need a throwaway Postgres, never Neon");
  u.pathname = `${u.pathname}_stage`;
  return u.toString();
}

/**
 * Recreates "stage" as a copy of "production" (like the real stage branch, which started as a copy
 * of production): same migrations, every row copied with COPY.
 */
export async function freshStageCopy(prodUrl: string) {
  const stageUrl = stageUrlFor(prodUrl);
  const name = new URL(stageUrl).pathname.slice(1);
  const admin = postgres(prodUrl, { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`drop database if exists "${name}" with (force)`);
    await admin.unsafe(`create database "${name}"`);
  } finally {
    await admin.end();
  }
  const stage = postgres(stageUrl, { max: 1, onnotice: () => {} });
  const prod = postgres(prodUrl, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(stage), { migrationsFolder: "drizzle" });
    const tables = await prod<{ name: string }[]>`
      select table_name as name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'`;
    await stage.begin(async (tx) => {
      // Foreign keys are checked by triggers; copy in any order, then switch them back on.
      await tx`set local session_replication_role = replica`;
      // Empty everything first (a cascade later would wipe tables already copied).
      await tx.unsafe(`truncate ${tables.map((t) => `"${t.name}"`).join(", ")} cascade`);
      for (const { name: t } of tables) {
        const out = await prod.unsafe(`copy "${t}" to stdout`).readable();
        const into = await tx.unsafe(`copy "${t}" from stdin`).writable();
        await pipeline(out, into);
      }
    });
  } finally {
    await Promise.all([stage.end(), prod.end()]);
  }
  return stageUrl;
}

/** Runs SQL on "stage" (as the stage admin would, by editing there). */
export async function onStage<T>(prodUrl: string, fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(stageUrlFor(prodUrl), { max: 1, onnotice: () => {} });
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { serverEnv } from "@/env/server";
import { db } from "@/lib/db/client";
import { donations } from "@/lib/db/schema";
import * as schema from "@/lib/db/schema";
import { compare, type Compared } from "./diff";
import { loadSnapshot, type Reader, type Snapshot } from "./snapshot";

/** Why Move from stage can't run here (null: it can). `setup` problems link to the setup steps. */
export function setupProblem(): { message: string; setup?: boolean } | null {
  const { STAGE_DATABASE_URL: stage, STAGE_MEDIA_PUBLIC_URL: mediaUrl, DATABASE_URL: own } = serverEnv;
  if (!stage || !mediaUrl)
    return {
      message:
        "Move from stage isn’t set up on this site: STAGE_DATABASE_URL and STAGE_MEDIA_PUBLIC_URL are needed.",
      setup: true,
    };
  const where = (u: string) => {
    const x = new URL(u);
    return `${x.hostname}:${x.port}${x.pathname}`;
  };
  if (where(stage) === where(own))
    return {
      message: "STAGE_DATABASE_URL points at this site’s own database. It must be the stage database.",
    };
  return null;
}

/**
 * Reads the stage database inside a READ ONLY transaction (as well as with a read-only login), so
 * nothing here can ever write to stage.
 */
export async function readStage<T>(fn: (r: Reader) => Promise<T>): Promise<T> {
  const url = serverEnv.STAGE_DATABASE_URL;
  if (!url) throw new Error("STAGE_DATABASE_URL is not set");
  // prepare: false works through Neon's connection pooler as well as a direct connection.
  const client = postgres(url, {
    max: 1,
    prepare: false,
    onnotice: () => {},
    idle_timeout: 5,
    connect_timeout: 15,
  });
  try {
    return await drizzle(client, { schema }).transaction((tx) => fn(tx as unknown as Reader), {
      accessMode: "read only",
    });
  } finally {
    await client.end();
  }
}

export type Comparison =
  | { ok: false; message: string; setup?: boolean }
  | { ok: true; stage: Snapshot; prod: Snapshot; rows: Compared[]; at: Date };

/** Stage against production, both read fresh. */
export async function compareSites(): Promise<Comparison> {
  const problem = setupProblem();
  if (problem) return { ok: false, ...problem };
  let stage: Snapshot;
  try {
    stage = await readStage(loadSnapshot);
  } catch (error) {
    console.error("Move from stage: reading stage failed", error);
    return {
      ok: false,
      message: "Couldn’t read the stage database. Check STAGE_DATABASE_URL and try again.",
    };
  }
  const prod = await loadSnapshot(db as unknown as Reader);
  if (stage.migration !== prod.migration)
    return {
      ok: false,
      message:
        "Stage and production are on different versions of the website (database updates differ). Release the code to production first, then compare again.",
    };
  const rows = compare(stage.units, prod.units);
  // A cause that has donations on production can't be removed (it can be closed instead).
  const onlyCauses = rows.filter((r) => r.status === "prod_only" && r.type === "cause").map((r) => r.id);
  if (onlyCauses.length) {
    const used = new Set(
      (
        await db
          .selectDistinct({ id: donations.causeId })
          .from(donations)
          .where(inArray(donations.causeId, onlyCauses))
      ).map((d) => d.id),
    );
    for (const r of rows)
      if (r.status === "prod_only" && used.has(r.id))
        r.note = "Has donations on production, so it can’t be removed. Set it to Closed instead.";
  }
  return { ok: true, stage, prod, rows, at: new Date() };
}

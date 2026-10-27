// Applies SQL migrations from drizzle/ to DATABASE_URL (Neon or any Postgres).
// Usage: npm run db:migrate   (reads .env.local, then .env)
import { config } from "dotenv";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { ensureDefaults } from "../src/lib/admin/defaults";
import * as schema from "../src/lib/db/schema";

config({ path: [".env.local", ".env"], quiet: true });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Put it in .env.local (see .env.example).");
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
  console.log(`Migrations applied to ${new URL(url).host}`);
  // Built-in page texts and menus into the database (fills gaps only; never overwrites edits).
  const filled = await ensureDefaults(drizzle(sql, { schema }));
  if (filled.pages || filled.menus)
    console.log(`Defaults added: ${filled.pages} page texts, ${filled.menus} menus`);
} finally {
  await sql.end();
}

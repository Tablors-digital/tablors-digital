// Applies src/server/db/migrations/*.sql in order, once each, tracked in
// __tablors_migrations. Safe to re-run. If the database already has the
// baseline schema (created before tracking existed) 0000 is marked applied.
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL (or MIGRATION_DATABASE_URL) before running migrations.");
  process.exit(1);
}
const host = new URL(url).hostname;
const sql = postgres(url, { max: 1, prepare: false, ssl: ["localhost", "127.0.0.1", "::1"].includes(host) ? false : "require", onnotice: () => {} });
const dir = path.join(process.cwd(), "src/server/db/migrations");
const files = fs.readdirSync(dir).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();

try {
  await sql`create table if not exists __tablors_migrations (name text primary key, applied_at timestamptz not null default now())`;
  const done = new Set((await sql`select name from __tablors_migrations`).map((r) => r.name));
  const [{ exists }] = await sql`select to_regclass('public.restaurants') is not null as exists`;
  if (done.size === 0 && exists && files[0]) {
    await sql`insert into __tablors_migrations (name) values (${files[0]}) on conflict do nothing`;
    done.add(files[0]);
  }
  for (const f of files) {
    if (done.has(f)) continue;
    const stmts = fs.readFileSync(path.join(dir, f), "utf8").split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
    await sql.begin(async (tx) => {
      for (const s of stmts) await tx.unsafe(s);
      await tx`insert into __tablors_migrations (name) values (${f})`;
    });
    console.log("applied", f);
  }
  console.log("migrations up to date");
} finally {
  await sql.end();
}

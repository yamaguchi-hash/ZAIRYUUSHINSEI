/**
 * DBマイグレーション実行スクリプト（DROP & RE-CREATE）
 * 実行: npx tsx scripts/migrate.ts
 */

import { neon } from "@neondatabase/serverless";
import { readFile, readdir } from "fs/promises";
import path from "path";

async function migrate() {
  const sql = neon(process.env.DATABASE_URL!);

  // Drop all tables and types to start fresh
  console.log("Dropping existing tables...");
  await sql.query(`
    DO $$ DECLARE
      r RECORD;
    BEGIN
      FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
      END LOOP;
    END $$;
  `);

  // Drop custom enum types
  console.log("Dropping existing enum types...");
  await sql.query(`
    DO $$ DECLARE
      r RECORD;
    BEGIN
      FOR r IN (SELECT typname FROM pg_type WHERE typtype = 'e' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')) LOOP
        EXECUTE 'DROP TYPE IF EXISTS public.' || quote_ident(r.typname) || ' CASCADE';
      END LOOP;
    END $$;
  `);

  // Apply migration files in order
  const migrationsDir = path.join(process.cwd(), "drizzle");
  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    console.log(`Applying migration: ${file}`);
    const content = await readFile(path.join(migrationsDir, file), "utf-8");
    // Split by statement-breakpoint and execute each statement
    const statements = content
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await sql.query(statement);
    }
  }

  console.log("Migration complete!");
}

migrate().catch((e) => { console.error(e); process.exit(1); });

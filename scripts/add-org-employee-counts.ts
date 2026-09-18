/**
 * organization_master に外国人従業員数・技能実習生数の列を追加（追加のみ・冪等）。
 *   実行: npx tsx scripts/add-org-employee-counts.ts
 */
import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";

function loadDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = readFileSync(".env.local", "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^DATABASE_URL\s*=\s*(.*)$/);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  throw new Error("DATABASE_URL が見つかりません（.env.local）");
}

async function main() {
  const sql = neon(loadDatabaseUrl());
  await sql`ALTER TABLE organization_master ADD COLUMN IF NOT EXISTS foreign_employee_count integer`;
  await sql`ALTER TABLE organization_master ADD COLUMN IF NOT EXISTS technical_intern_count integer`;
  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'organization_master'
      AND column_name IN ('foreign_employee_count','technical_intern_count')
    ORDER BY column_name
  `;
  console.log("organization_master new columns:", cols.map((c: any) => c.column_name).join(", ") || "(none)");
}

main().then(() => { console.log("done"); process.exit(0); }).catch((e) => { console.error(e); process.exit(1); });

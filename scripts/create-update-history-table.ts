/**
 * applicant_update_history テーブルを本番DBに追加する一度きりのスクリプト。
 * このテーブルのみを CREATE TABLE IF NOT EXISTS で作成し、他のスキーマには一切触れない。
 *   実行: npx tsx scripts/create-update-history-table.ts
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
  await sql`
    CREATE TABLE IF NOT EXISTS applicant_update_history (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      applicant_id uuid NOT NULL REFERENCES applicant_master(id) ON DELETE CASCADE,
      tenant_id uuid NOT NULL REFERENCES tenants(id),
      user_id uuid REFERENCES users(id),
      change_type text NOT NULL,
      source text,
      document_type text,
      field_key text,
      old_value text,
      new_value text,
      old_file_url text,
      old_file_name text,
      created_at timestamp NOT NULL DEFAULT now()
    )
  `;
  const check = await sql`SELECT to_regclass('public.applicant_update_history') AS tbl`;
  console.log("applicant_update_history:", check[0]?.tbl ?? "(not found)");
}

main().then(() => { console.log("done"); process.exit(0); }).catch((e) => { console.error(e); process.exit(1); });

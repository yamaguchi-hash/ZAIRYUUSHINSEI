/**
 * 総合プラットフォーム化・法定事件簿のためのスキーマ追加（追加のみ・安全）。
 *  - applications に business_category / custom_data を追加
 *  - consultation_logs / dispatch_records / legal_case_ledger を新設
 * すべて IF NOT EXISTS で冪等。既存データには影響しない。
 *   実行: npx tsx scripts/add-platform-ledger-tables.ts
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

  await sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS business_category text NOT NULL DEFAULT 'immigration'`;
  await sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS custom_data jsonb`;

  await sql`
    CREATE TABLE IF NOT EXISTS consultation_logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id),
      application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
      type text NOT NULL,
      summary text,
      details text,
      created_by_id uuid REFERENCES users(id),
      created_at timestamp NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS dispatch_records (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id),
      application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
      dispatch_date date,
      destination text,
      method text,
      tracking_number text,
      contents text,
      created_by_id uuid REFERENCES users(id),
      created_at timestamp NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS legal_case_ledger (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id),
      application_id uuid NOT NULL UNIQUE REFERENCES applications(id) ON DELETE CASCADE,
      case_number text,
      applicant_id uuid REFERENCES applicant_master(id),
      organization_id uuid REFERENCES organization_master(id),
      accepted_at date,
      completed_at date,
      fee_amount integer,
      status text,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `;

  for (const t of ["consultation_logs", "dispatch_records", "legal_case_ledger"]) {
    const r = await sql`SELECT to_regclass(${"public." + t}) AS tbl`;
    console.log(`${t}:`, r[0]?.tbl ?? "(not found)");
  }
  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'applications' AND column_name IN ('business_category','custom_data')
    ORDER BY column_name
  `;
  console.log("applications new columns:", cols.map((c: any) => c.column_name).join(", ") || "(none)");
}

main().then(() => { console.log("done"); process.exit(0); }).catch((e) => { console.error(e); process.exit(1); });

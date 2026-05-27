import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const req = await sql`
    SELECT visa_type, application_type, document_name, is_always_required
    FROM document_requirement_master
    WHERE is_always_required = true
    ORDER BY visa_type, application_type, sort_order
  `;
  console.log("=== isAlwaysRequired=true 書類一覧 ===");
  req.forEach((r: any) => console.log(`  ${r.visa_type} | ${r.application_type} | ${r.document_name}`));
  console.log("計:", req.length, "件\n");

  const apps = await sql`
    SELECT id, visa_type, application_type FROM applications
    WHERE status != 'cancelled' LIMIT 5
  `;
  console.log("=== 申請案件 ===");
  apps.forEach((a: any) => console.log(`  ${a.id.slice(0,8)}... | ${a.visa_type} | ${a.application_type}`));
}

main().catch(console.error);

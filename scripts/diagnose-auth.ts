/**
 * 認証診断スクリプト
 * 実行: npx tsx scripts/diagnose-auth.ts
 */

import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";

const sql = neon(process.env.DATABASE_URL!);

async function diagnose() {
  console.log("=== 認証診断開始 ===\n");

  // 1. ユーザー一覧
  const users = await sql`SELECT id, email, role, tenant_id, is_active, password_hash IS NOT NULL as has_hash FROM users`;
  console.log("【DBのユーザー一覧】");
  for (const u of users) {
    console.log(`  email: ${u.email}`);
    console.log(`  role: ${u.role}`);
    console.log(`  tenant_id: ${u.tenant_id}`);
    console.log(`  is_active: ${u.is_active}`);
    console.log(`  has_password_hash: ${u.has_hash}`);
    console.log("");
  }

  // 2. パスワード照合テスト
  const [expert] = await sql`SELECT password_hash FROM users WHERE email = 'yamaguchi@jls-gyosei.jp'`;
  if (expert?.password_hash) {
    const isValid = await bcrypt.compare("Admin@1234", expert.password_hash);
    console.log(`【パスワード照合テスト】`);
    console.log(`  yamaguchi@jls-gyosei.jp / Admin@1234 → ${isValid ? "✅ 一致" : "❌ 不一致"}`);
  } else {
    console.log("❌ ユーザーまたはパスワードハッシュが存在しません");
  }

  // 3. テナント確認
  const tenants = await sql`SELECT id, name FROM tenants`;
  console.log("\n【テナント一覧】");
  for (const t of tenants) console.log(`  ${t.name} (${t.id})`);

  console.log("\n=== 診断完了 ===");
}

diagnose().catch(console.error);

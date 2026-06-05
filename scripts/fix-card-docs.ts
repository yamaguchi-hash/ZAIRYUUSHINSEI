import { config } from "dotenv";
config({ path: ".env.local" });
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { documentRequirementMaster, applicationDocumentChecklist } from "../src/lib/db/schema";
import { eq, like } from "drizzle-orm";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

async function main() {
  // 裏面を非アクティブ化（FK制約で削除不可のため）
  const back = await db
    .select()
    .from(documentRequirementMaster)
    .where(like(documentRequirementMaster.documentName, "%扶養者の在留カード（裏面）%"));

  for (const r of back) {
    await db
      .update(documentRequirementMaster)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(documentRequirementMaster.id, r.id));
    console.log(`✓ 非アクティブ化: ${r.documentName} (${r.id})`);

    // 既存チェックリストの書類名も更新
    await db
      .update(applicationDocumentChecklist)
      .set({ documentName: "扶養者の在留カード（裏表）の写し", updatedAt: new Date() })
      .where(eq(applicationDocumentChecklist.documentRequirementId, r.id));
    console.log(`  → チェックリストの書類名も統合名に変更`);
  }

  console.log("\n完了");
}

main().catch(console.error);

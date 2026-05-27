import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { documentRequirementMaster, applicationDocumentChecklist } from "../src/lib/db/schema";
import { like, inArray, eq } from "drizzle-orm";
import { config } from "dotenv";
config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

async function main() {
  // 申請書に該当するレコードを取得
  const targets = await db
    .select({ id: documentRequirementMaster.id, name: documentRequirementMaster.documentName })
    .from(documentRequirementMaster)
    .where(like(documentRequirementMaster.documentName, "%申請書%"));

  console.log("削除対象:");
  targets.forEach((t) => console.log(" -", t.name));
  console.log("計:", targets.length, "件");

  if (targets.length === 0) {
    console.log("対象なし");
    return;
  }

  const ids = targets.map((t) => t.id);

  // チェックリスト参照を解除
  await db
    .update(applicationDocumentChecklist)
    .set({ documentRequirementId: null as any })
    .where(inArray(applicationDocumentChecklist.documentRequirementId, ids));
  console.log("チェックリスト参照解除完了");

  // マスターから削除
  await db
    .delete(documentRequirementMaster)
    .where(inArray(documentRequirementMaster.id, ids));
  console.log("✅ 申請書エントリの削除完了");
}

main().catch((e) => { console.error(e); process.exit(1); });

/**
 * 初期データ投入スクリプト（Neon PostgreSQL版）
 * 実行: npx tsx scripts/seed.ts
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../src/lib/db/schema";
import bcrypt from "bcryptjs";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

async function seed() {
  console.log("Seeding Neon database...");

  const [tenant] = await db.insert(schema.tenants).values({
    name: "山口行政書士事務所",
    type: "law_office",
    contactEmail: "yamaguchi@jls-gyosei.jp",
  }).returning();
  console.log("Created tenant:", tenant.id);

  const adminHash = await bcrypt.hash("Admin@1234", 12);
  const [admin] = await db.insert(schema.users).values({
    email: "yamaguchi@jls-gyosei.jp",
    name: "山口 太郎",
    passwordHash: adminHash,
    role: "expert",
    tenantId: tenant.id,
  }).returning();

  const sysHash = await bcrypt.hash("System@1234", 12);
  await db.insert(schema.users).values({
    email: "sysadmin@system.local",
    name: "システム管理者",
    passwordHash: sysHash,
    role: "admin",
    tenantId: tenant.id,
  });
  console.log("Created users.");

  const renewalDocs = [
    { name: "在留期間更新許可申請書", required: true, order: 1 },
    { name: "パスポート（有効なもの）", required: true, order: 2 },
    { name: "在留カード", required: true, order: 3 },
    { name: "証明写真（縦4cm×横3cm）", required: true, order: 4 },
    { name: "住民票", required: true, order: 5 },
    { name: "源泉徴収票（直近年分）", required: true, order: 6 },
    { name: "雇用契約書の写し", required: true, order: 7 },
    { name: "所属機関の登記事項証明書", required: true, order: 8 },
    { name: "所属機関の決算文書の写し（直近年度）", required: false, order: 9 },
    { name: "卒業証明書", required: false, order: 10 },
  ];
  for (const doc of renewalDocs) {
    await db.insert(schema.documentRequirementMaster).values({
      visaType: "engineer_humanities",
      applicationType: "renewal",
      documentName: doc.name,
      isAlwaysRequired: doc.required,
      sortOrder: doc.order,
    });
  }

  const certDocs = [
    { name: "在留資格認定証明書交付申請書", required: true, order: 1 },
    { name: "証明写真（縦4cm×横3cm）", required: true, order: 2 },
    { name: "返信用封筒（定形封筒/404円切手貼付）", required: true, order: 3 },
    { name: "卒業証書または卒業証明書", required: true, order: 4 },
    { name: "雇用契約書の写し", required: true, order: 5 },
    { name: "職務内容説明書", required: true, order: 6 },
    { name: "所属機関の登記事項証明書", required: true, order: 7 },
    { name: "所属機関の決算文書の写し（直近年度）", required: false, order: 8 },
  ];
  for (const doc of certDocs) {
    await db.insert(schema.documentRequirementMaster).values({
      visaType: "engineer_humanities",
      applicationType: "certification",
      documentName: doc.name,
      isAlwaysRequired: doc.required,
      sortOrder: doc.order,
    });
  }
  console.log("Document requirements seeded.");

  const [applicant] = await db.insert(schema.applicantMaster).values({
    tenantId: tenant.id,
    familyNameEn: "ZHANG",
    givenNameEn: "WEI",
    familyNameJa: "張",
    givenNameJa: "偉",
    nationality: "中国",
    dateOfBirth: "1995-03-15",
    gender: "M",
    passportNumber: "E12345678",
    passportExpiry: "2030-03-14",
    residenceCardNumber: "AB12345678CD",
    currentVisaType: "engineer_humanities",
    currentVisaExpiry: "2026-03-31",
    emailAddress: "zhang.wei@example.com",
    japanAddress: "東京都渋谷区渋谷1-1-1",
  }).returning();

  const [org] = await db.insert(schema.organizationMaster).values({
    tenantId: tenant.id,
    nameJa: "株式会社テックイノベーション",
    nameEn: "Tech Innovation Co., Ltd.",
    corporateNumber: "1234567890123",
    prefecture: "東京都",
    city: "渋谷区",
    addressLine: "渋谷2-2-2",
    category: "2",
    employeeCount: 150,
    industry: "IT・情報通信",
  }).returning();

  const [app] = await db.insert(schema.applications).values({
    tenantId: tenant.id,
    applicantId: applicant.id,
    organizationId: org.id,
    applicationType: "renewal",
    visaType: "engineer_humanities",
    status: "documents_collecting",
    caseNumber: "APP-DEMO-001",
    expertUserId: admin.id,
  }).returning();

  const allDocs = await db.select().from(schema.documentRequirementMaster);
  const renewalReqs = allDocs.filter(
    (r) => r.visaType === "engineer_humanities" && r.applicationType === "renewal"
  );
  for (const req of renewalReqs) {
    await db.insert(schema.applicationDocumentChecklist).values({
      applicationId: app.id,
      documentRequirementId: req.id,
      documentName: req.documentName,
      isRequiredByExpert: req.isAlwaysRequired,
      status: req.isAlwaysRequired && req.sortOrder <= 6 ? "submitted" : "not_submitted",
    });
  }

  console.log("\nSeed complete!");
  console.log("  Expert: yamaguchi@jls-gyosei.jp / Admin@1234");
  console.log("  Admin:  sysadmin@system.local / System@1234");
  console.log("  Tenant ID:", tenant.id);
}

seed().catch((e) => { console.error(e); process.exit(1); });

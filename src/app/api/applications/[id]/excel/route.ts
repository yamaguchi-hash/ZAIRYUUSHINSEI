import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, applications, applicantMaster } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import type { ApplicationFormData, FamilyMember } from "@/lib/form-types";
import ExcelJS from "exceljs";

// ─── 日付フォーマット ─────────────────────────────────────────────────────────
function fmtDate(v: string | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}
function fmtVal(v: string | null | undefined): string {
  return v ?? "";
}

// ─── セルスタイル ─────────────────────────────────────────────────────────────
const TITLE_FILL: ExcelJS.Fill = {
  type: "pattern", pattern: "solid",
  fgColor: { argb: "FF1E3A5F" },
};
const SECTION_FILL: ExcelJS.Fill = {
  type: "pattern", pattern: "solid",
  fgColor: { argb: "FF2D6A9F" },
};
const SUB_FILL: ExcelJS.Fill = {
  type: "pattern", pattern: "solid",
  fgColor: { argb: "FF5B9BD5" },
};
const VALUE_FILL: ExcelJS.Fill = {
  type: "pattern", pattern: "solid",
  fgColor: { argb: "FFFFFF00" }, // 黄色（コピー対象を視覚的に区別）
};
const LABEL_FILL: ExcelJS.Fill = {
  type: "pattern", pattern: "solid",
  fgColor: { argb: "FFF2F2F2" },
};
const BORDER: Partial<ExcelJS.Borders> = {
  top:    { style: "thin", color: { argb: "FFB0B0B0" } },
  left:   { style: "thin", color: { argb: "FFB0B0B0" } },
  bottom: { style: "thin", color: { argb: "FFB0B0B0" } },
  right:  { style: "thin", color: { argb: "FFB0B0B0" } },
};

function addTitle(ws: ExcelJS.Worksheet, title: string, sub: string) {
  ws.mergeCells("A1:D1");
  const t = ws.getCell("A1");
  t.value = title;
  t.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" }, name: "MS Gothic" };
  t.fill = TITLE_FILL;
  t.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 28;

  ws.mergeCells("A2:D2");
  const s = ws.getCell("A2");
  s.value = sub;
  s.font = { size: 9, color: { argb: "FF888888" }, name: "MS Gothic" };
  s.alignment = { horizontal: "center" };
  ws.getRow(2).height = 16;
}

function addSectionHeader(ws: ExcelJS.Worksheet, row: number, text: string) {
  ws.mergeCells(`A${row}:D${row}`);
  const c = ws.getCell(`A${row}`);
  c.value = text;
  c.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "MS Gothic" };
  c.fill = SECTION_FILL;
  c.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  ws.getRow(row).height = 20;
}

function addSubHeader(ws: ExcelJS.Worksheet, row: number, text: string) {
  ws.mergeCells(`A${row}:D${row}`);
  const c = ws.getCell(`A${row}`);
  c.value = text;
  c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10, name: "MS Gothic" };
  c.fill = SUB_FILL;
  c.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  ws.getRow(row).height = 18;
}

interface FieldRow {
  no: string;
  label: string;
  value: string;
  note?: string;
}

function addRow(ws: ExcelJS.Worksheet, row: number, f: FieldRow) {
  const rNo    = ws.getCell(`A${row}`);
  const rLabel = ws.getCell(`B${row}`);
  const rVal   = ws.getCell(`C${row}`);
  const rNote  = ws.getCell(`D${row}`);

  rNo.value    = f.no;
  rLabel.value = f.label;
  rVal.value   = f.value;
  rNote.value  = f.note ?? "";

  rNo.font    = { name: "MS Gothic", size: 10 };
  rLabel.font = { name: "MS Gothic", size: 10 };
  rVal.font   = { name: "MS Gothic", size: 10, bold: !!f.value };
  rNote.font  = { name: "MS Gothic", size: 9, color: { argb: "FF888888" }, italic: true };

  rLabel.fill = LABEL_FILL;
  if (f.value) {
    rVal.fill = VALUE_FILL;
  }

  [rNo, rLabel, rVal, rNote].forEach(c => {
    c.border = BORDER;
    c.alignment = { vertical: "middle", wrapText: true };
  });

  ws.getRow(row).height = f.value && f.value.length > 40 ? 36 : 18;
}

function setColumnWidths(ws: ExcelJS.Worksheet) {
  ws.getColumn("A").width = 8;
  ws.getColumn("B").width = 32;
  ws.getColumn("C").width = 40;
  ws.getColumn("D").width = 22;
  ws.getRow(3).values = ["項目", "フィールド名", "← コピーして貼り付け", "備考"];
  ["A3","B3","C3","D3"].forEach(addr => {
    const c = ws.getCell(addr);
    c.font = { bold: true, size: 9, color: { argb: "FF555555" }, name: "MS Gothic" };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.border = BORDER;
  });
}

// ─── メインルート ─────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const tenantId = (session?.user as any)?.tenantId;
  if (!session?.user || !tenantId) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const [app] = await db.select().from(applications)
    .where(and(eq(applications.id, id), eq(applications.tenantId, tenantId))).limit(1);
  if (!app) return NextResponse.json({ error: "案件が見つかりません" }, { status: 404 });

  const [applicant] = await db.select().from(applicantMaster)
    .where(eq(applicantMaster.id, app.applicantId)).limit(1);

  const f = (app.formData ?? {}) as Partial<ApplicationFormData>;

  const toFormType = (t: string) => {
    if (t === "coe" || t === "certification") return "coe";
    if (t === "change") return "change";
    if (t === "extension" || t === "renewal") return "extension";
    return "extension";
  };
  const formType = toFormType(f.applicationFormType ?? app.applicationType);
  const isCoe      = formType === "coe";
  const isChange   = formType === "change";
  const isExtension = formType === "extension";
  const cat = f.visaFormCategory ?? "N";
  const isRtype = cat === "R";
  const isTtype = cat === "T";
  const isNtype = ["N","L","I","V"].includes(cat);
  const isPtype = cat === "P";

  const wb = new ExcelJS.Workbook();
  wb.creator = "行政書士法人 JLS";
  wb.created = new Date();

  // ══════════════════════════════════════════════════════════════════════
  // Sheet 1: 申請人用 Part 1（共通）
  // ══════════════════════════════════════════════════════════════════════
  const ws1 = wb.addWorksheet("申請人用①（共通）");
  const formTypeLabel =
    isCoe ? "在留資格認定証明書交付申請" :
    isChange ? "在留資格変更許可申請" :
    isExtension ? "在留期間更新許可申請" : "在留申請";

  addTitle(ws1,
    `${formTypeLabel} — 申請人等作成用 Part 1`,
    `申請人: ${fmtVal(f.familyNameEn)} ${fmtVal(f.givenNameEn)}　|　案件番号: ${app.caseNumber ?? id}`
  );
  setColumnWidths(ws1);

  let r = 4;

  addSectionHeader(ws1, r++, "■ 基本情報");
  const hasBirthplace = isCoe || isChange;
  [
    { no: "1", label: "国籍・地域", value: fmtVal(f.nationality) },
    { no: "2", label: "生年月日（年）", value: f.dateOfBirth ? new Date(f.dateOfBirth).getFullYear().toString() : "" },
    { no: "2", label: "生年月日（月）", value: f.dateOfBirth ? String(new Date(f.dateOfBirth).getMonth()+1) : "" },
    { no: "2", label: "生年月日（日）", value: f.dateOfBirth ? String(new Date(f.dateOfBirth).getDate()) : "" },
    { no: "3", label: "氏名 Family Name（ローマ字）", value: fmtVal(f.familyNameEn) },
    { no: "3", label: "氏名 Given Name（ローマ字）", value: fmtVal(f.givenNameEn) },
    { no: "3", label: "氏名（漢字・姓）", value: fmtVal(f.familyNameJa) },
    { no: "3", label: "氏名（漢字・名）", value: fmtVal(f.givenNameJa) },
    { no: "4", label: "性別", value: fmtVal(f.sex) },
    ...(hasBirthplace ? [{ no: "5", label: "出生地", value: fmtVal(f.placeOfBirth) }] : []),
    { no: hasBirthplace ? "6" : "5", label: "配偶者の有無", value: fmtVal(f.maritalStatus) },
    { no: hasBirthplace ? "7" : "6", label: "職業", value: fmtVal(f.occupation) },
    { no: hasBirthplace ? "8" : "7", label: "本国における居住地", value: fmtVal(f.homeTownCity) },
  ].forEach(row => { addRow(ws1, r++, row); });

  addSubHeader(ws1, r++, `  ${hasBirthplace ? "9" : "8"}. 住居地（日本）`);
  [
    { no: "", label: "郵便番号", value: fmtVal(f.postalCodeInJapan), note: "ハイフンなし7桁" },
    { no: "", label: "都道府県", value: fmtVal(f.prefectureInJapan) },
    { no: "", label: "市区町村", value: fmtVal(f.cityInJapan) },
    { no: "", label: "番地・建物名・部屋番号", value: fmtVal(f.addressLineInJapan) },
    { no: "", label: "電話番号", value: fmtVal(f.telephoneNo) },
    { no: "", label: "携帯電話番号", value: fmtVal(f.cellularPhoneNo) },
  ].forEach(row => { addRow(ws1, r++, row); });

  addSubHeader(ws1, r++, `  ${hasBirthplace ? "10" : "9/10"}. 旅券（パスポート）`);
  [
    { no: "", label: "(1) 旅券番号", value: fmtVal(f.passportNumber) },
    { no: "", label: "(2) 有効期限（年）", value: f.passportExpiry ? new Date(f.passportExpiry).getFullYear().toString() : "" },
    { no: "", label: "(2) 有効期限（月）", value: f.passportExpiry ? String(new Date(f.passportExpiry).getMonth()+1) : "" },
    { no: "", label: "(2) 有効期限（日）", value: f.passportExpiry ? String(new Date(f.passportExpiry).getDate()) : "" },
  ].forEach(row => { addRow(ws1, r++, row); });

  if (!isCoe) {
    addSubHeader(ws1, r++, `  11. 現在の在留状況`);
    [
      { no: "11", label: "現在の在留資格", value: fmtVal(f.currentStatusOfResidence) },
      { no: "11", label: "在留期間", value: fmtVal(f.currentPeriodOfStay), note: "例：3年、1年" },
      { no: "11", label: "在留期間の満了日（年）", value: f.currentPeriodExpiry ? new Date(f.currentPeriodExpiry).getFullYear().toString() : "" },
      { no: "11", label: "在留期間の満了日（月）", value: f.currentPeriodExpiry ? String(new Date(f.currentPeriodExpiry).getMonth()+1) : "" },
      { no: "11", label: "在留期間の満了日（日）", value: f.currentPeriodExpiry ? String(new Date(f.currentPeriodExpiry).getDate()) : "" },
      { no: "12", label: "在留カード番号", value: fmtVal(f.residenceCardNumber) },
      ...(isChange
        ? [{ no: "13", label: "希望する在留資格", value: fmtVal(f.desiredStatusOfResidence) }]
        : []),
      { no: isChange ? "13" : "13", label: "希望する在留期間", value: fmtVal(f.desiredPeriodOfStay), note: "例：3年" },
      { no: isChange ? "14" : "14", label: "更新・変更の理由", value: fmtVal(f.reasonForApplication) },
    ].forEach(row => { addRow(ws1, r++, row); });
  }

  addSubHeader(ws1, r++, `  ${isCoe ? "19" : "15"}. 犯罪記録`);
  addRow(ws1, r++, { no: isCoe ? "19" : "15", label: "犯罪を理由とする処分の有無", value: fmtVal(f.criminalRecord), note: "有 または 無" });
  if (f.criminalRecord === "有") {
    addRow(ws1, r++, { no: "", label: "具体的内容", value: fmtVal(f.criminalRecordDetail) });
  }

  addSubHeader(ws1, r++, `  ${isCoe ? "21" : "16"}. 在日親族及び同居者`);
  addRow(ws1, r++, { no: isCoe ? "21" : "16", label: "在日親族の有無", value: fmtVal(f.familyInJapanExists), note: "有 または 無" });
  const family = (f.familyInJapan ?? []) as FamilyMember[];
  if (family.length > 0) {
    family.forEach((m, i) => {
      addRow(ws1, r++, { no: "", label: `家族${i+1}：続柄`, value: fmtVal(m.relationship) });
      addRow(ws1, r++, { no: "", label: `家族${i+1}：氏名`, value: fmtVal(m.name) });
      addRow(ws1, r++, { no: "", label: `家族${i+1}：生年月日`, value: fmtDate(m.dateOfBirth) });
      addRow(ws1, r++, { no: "", label: `家族${i+1}：国籍`, value: fmtVal(m.nationality) });
      addRow(ws1, r++, { no: "", label: `家族${i+1}：同居の有無`, value: m.residingTogether ? "有" : "無" });
      addRow(ws1, r++, { no: "", label: `家族${i+1}：勤務先・通学先`, value: fmtVal(m.placeOfEmployment) });
      addRow(ws1, r++, { no: "", label: `家族${i+1}：在留カード番号`, value: fmtVal(m.residenceCardNumber) });
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // Sheet 2: 申請人用 Part 2（在留資格別）
  // ══════════════════════════════════════════════════════════════════════
  const ws2 = wb.addWorksheet("申請人用②（在留資格別）");
  const p2Label = isRtype ? "Ｒ型（家族滞在）" : isTtype ? "Ｔ型（配偶者等）" : isNtype ? "Ｎ型（就労系）" : isPtype ? "Ｐ型（留学）" : "補足";
  addTitle(ws2, `${formTypeLabel} — 申請人等作成用 Part 2 ${p2Label}`, `申請人: ${fmtVal(f.familyNameEn)} ${fmtVal(f.givenNameEn)}`);
  setColumnWidths(ws2);
  let r2 = 4;

  if (isRtype) {
    addSectionHeader(ws2, r2++, "■ 17. 婚姻・出生又は縁組の届出先及び届出年月日");
    [
      { no: "17", label: "(1) 日本国届出先（市区町村役場名）", value: fmtVal(f.marriageNotificationPlaceJapan) },
      { no: "17", label: "(1) 日本国届出年月日（年）", value: f.marriageNotificationDateJapan ? new Date(f.marriageNotificationDateJapan).getFullYear().toString() : "" },
      { no: "17", label: "(1) 日本国届出年月日（月）", value: f.marriageNotificationDateJapan ? String(new Date(f.marriageNotificationDateJapan).getMonth()+1) : "" },
      { no: "17", label: "(1) 日本国届出年月日（日）", value: f.marriageNotificationDateJapan ? String(new Date(f.marriageNotificationDateJapan).getDate()) : "" },
      { no: "17", label: "(2) 本国等届出先（登録機関名）", value: fmtVal(f.marriageNotificationPlaceForeign) },
      { no: "17", label: "(2) 本国等届出年月日（年）", value: f.marriageNotificationDateForeign ? new Date(f.marriageNotificationDateForeign).getFullYear().toString() : "" },
      { no: "17", label: "(2) 本国等届出年月日（月）", value: f.marriageNotificationDateForeign ? String(new Date(f.marriageNotificationDateForeign).getMonth()+1) : "" },
      { no: "17", label: "(2) 本国等届出年月日（日）", value: f.marriageNotificationDateForeign ? String(new Date(f.marriageNotificationDateForeign).getDate()) : "" },
    ].forEach(row => { addRow(ws2, r2++, row); });

    addSectionHeader(ws2, r2++, "■ 18. 滞在費支弁方法");
    addRow(ws2, r2++, { no: "18", label: "滞在費支弁方法", value: fmtVal(f.fundingMethod), note: "親族負担/外国からの送金/身元保証人負担/その他" });
    if (f.fundingMethod === "その他") {
      addRow(ws2, r2++, { no: "", label: "その他の詳細", value: fmtVal(f.fundingMethodOther) });
    }

    addSectionHeader(ws2, r2++, "■ 19. 資格外活動の有無");
    addRow(ws2, r2++, { no: "19", label: "資格外活動の有無", value: fmtVal(f.partTimeWorkExistsR), note: "有 または 無" });
    if (f.partTimeWorkExistsR === "有") {
      [
        { no: "", label: "(1) 内容", value: fmtVal(f.partTimeWorkTypeR) },
        { no: "", label: "(2) 名称", value: fmtVal(f.partTimeWorkOrgNameR) },
        { no: "", label: "(2) 支店・事業所名", value: fmtVal(f.partTimeWorkBranchNameR) },
        { no: "", label: "(2) 電話番号", value: fmtVal(f.partTimeWorkPhoneR) },
        { no: "", label: "(3) 週間稼働時間（時間）", value: fmtVal(f.partTimeWorkHoursR) },
        { no: "", label: "(4) 報酬（円）", value: fmtVal(f.partTimeWorkSalaryR) },
        { no: "", label: "(4) 月額／日額", value: fmtVal(f.partTimeWorkSalaryTypeR) },
      ].forEach(row => { addRow(ws2, r2++, row); });
    }

    addSectionHeader(ws2, r2++, "■ 20. 代理人（法定代理人による申請の場合のみ）");
    [
      { no: "20", label: "(1) 氏名", value: fmtVal(f.representativeName) },
      { no: "20", label: "(2) 本人との関係", value: fmtVal(f.representativeRelationship) },
      { no: "20", label: "(3) 住所", value: fmtVal(f.representativeAddress) },
      { no: "20", label: "電話番号", value: fmtVal(f.representativePhone) },
      { no: "20", label: "携帯電話番号", value: fmtVal(f.representativeCellular) },
    ].forEach(row => { addRow(ws2, r2++, row); });
  }

  if (isTtype) {
    addSectionHeader(ws2, r2++, "■ 配偶者等（日本人・永住者等）の情報");
    [
      { no: "", label: "氏名 Family Name（ローマ字）", value: fmtVal(f.spouseFamilyNameEn) },
      { no: "", label: "氏名 Given Name（ローマ字）", value: fmtVal(f.spouseGivenNameEn) },
      { no: "", label: "氏名（漢字・姓）", value: fmtVal(f.spouseFamilyNameJa) },
      { no: "", label: "氏名（漢字・名）", value: fmtVal(f.spouseGivenNameJa) },
      { no: "", label: "生年月日", value: fmtDate(f.spouseDob) },
      { no: "", label: "国籍・身分", value: fmtVal(f.spouseResidenceStatus) },
      { no: "", label: "在留カード番号", value: fmtVal(f.spouseResidenceCard) },
      { no: "", label: "職業", value: fmtVal(f.spouseOccupation) },
      { no: "", label: "勤務先・通学先", value: fmtVal(f.spouseEmployer) },
      { no: "", label: "住所（日本）", value: fmtVal(f.spouseAddress) },
      { no: "", label: "婚姻年月日", value: fmtDate(f.marriageDate) },
      { no: "", label: "婚姻届出市区町村", value: fmtVal(f.marriageRegistrationPlace) },
      { no: "", label: "同居の有無", value: fmtVal(f.cohabitation) },
    ].forEach(row => { addRow(ws2, r2++, row); });
  }

  if (isNtype) {
    addSectionHeader(ws2, r2++, "■ 勤務先");
    [
      { no: "", label: "勤務先名称", value: fmtVal(f.employerName) },
      { no: "", label: "支店・事業所名", value: fmtVal(f.employerBranchName) },
      { no: "", label: "所在地（主たる勤務場所）", value: fmtVal(f.employerAddress) },
      { no: "", label: "電話番号", value: fmtVal(f.employerPhone) },
    ].forEach(row => { addRow(ws2, r2++, row); });

    addSectionHeader(ws2, r2++, "■ 最終学歴");
    [
      { no: "", label: "学校所在国", value: fmtVal(f.educationCountry) },
      { no: "", label: "学位・区分", value: fmtVal(f.educationDegree) },
      { no: "", label: "学校名", value: fmtVal(f.educationSchoolName) },
      { no: "", label: "卒業年月日", value: fmtDate(f.educationGraduationDate) },
      { no: "", label: "専攻・専門分野", value: fmtVal(f.majorCategory) },
    ].forEach(row => { addRow(ws2, r2++, row); });

    addSectionHeader(ws2, r2++, "■ 職歴");
    (f.workHistory ?? []).forEach((w: any, i: number) => {
      addRow(ws2, r2++, { no: "", label: `職歴${i+1}：入社年月`, value: fmtVal(w.joinDate) });
      addRow(ws2, r2++, { no: "", label: `職歴${i+1}：退社年月`, value: fmtVal(w.leaveDate), note: "現職は空欄" });
      addRow(ws2, r2++, { no: "", label: `職歴${i+1}：勤務先名称`, value: fmtVal(w.employer) });
    });
  }

  if (isPtype) {
    addSectionHeader(ws2, r2++, "■ 在籍学校（留学）");
    [
      { no: "", label: "学校名", value: fmtVal(f.schoolName) },
      { no: "", label: "学校種別", value: fmtVal(f.schoolType) },
      { no: "", label: "所在地", value: fmtVal(f.schoolAddress) },
      { no: "", label: "電話番号", value: fmtVal(f.schoolPhone) },
      { no: "", label: "在籍コース・専攻", value: fmtVal(f.courseOfStudy) },
      { no: "", label: "入学年月日", value: fmtDate(f.enrollmentDate) },
      { no: "", label: "卒業予定年月日", value: fmtDate(f.expectedGraduationDate) },
      { no: "", label: "年間学費（円）", value: fmtVal(f.annualTuition) },
      { no: "", label: "費用支弁方法", value: fmtVal(f.fundingSource) },
      { no: "", label: "月額生活費（円）", value: fmtVal(f.fundingAmount) },
      { no: "", label: "資格外活動許可の有無", value: fmtVal(f.partTimeWorkPermit) },
    ].forEach(row => { addRow(ws2, r2++, row); });
  }

  // ══════════════════════════════════════════════════════════════════════
  // Sheet 3: 扶養者用Ｒ（R型のみ）
  // ══════════════════════════════════════════════════════════════════════
  if (isRtype) {
    const ws3 = wb.addWorksheet("扶養者用Ｒ");
    addTitle(ws3, `${formTypeLabel} — 扶養者等作成用 Part 1 Ｒ（家族滞在）`, `申請人: ${fmtVal(f.familyNameEn)} ${fmtVal(f.givenNameEn)}`);
    setColumnWidths(ws3);
    let r3 = 4;

    addSectionHeader(ws3, r3++, "■ 1. 扶養している家族（申請人）の氏名及び在留カード番号");
    [
      { no: "1", label: "(1) 申請人氏名（ローマ字）", value: `${fmtVal(f.familyNameEn)} ${fmtVal(f.givenNameEn)}` },
      { no: "1", label: "(1) 申請人氏名（漢字）", value: `${fmtVal(f.familyNameJa)} ${fmtVal(f.givenNameJa)}` },
      { no: "1", label: "(2) 申請人 在留カード番号", value: fmtVal(f.residenceCardNumber) },
    ].forEach(row => { addRow(ws3, r3++, row); });

    addSectionHeader(ws3, r3++, "■ 2. 扶養者の情報");
    [
      { no: "2", label: "(1) 氏名 Family Name（ローマ字）", value: fmtVal(f.supporterFamilyNameEn) },
      { no: "2", label: "(1) 氏名 Given Name（ローマ字）", value: fmtVal(f.supporterGivenNameEn) },
      { no: "2", label: "(1) 氏名（漢字・姓）", value: fmtVal(f.supporterFamilyNameJa) },
      { no: "2", label: "(1) 氏名（漢字・名）", value: fmtVal(f.supporterGivenNameJa) },
      { no: "2", label: "(2) 生年月日（年）", value: f.supporterDob ? new Date(f.supporterDob).getFullYear().toString() : "" },
      { no: "2", label: "(2) 生年月日（月）", value: f.supporterDob ? String(new Date(f.supporterDob).getMonth()+1) : "" },
      { no: "2", label: "(2) 生年月日（日）", value: f.supporterDob ? String(new Date(f.supporterDob).getDate()) : "" },
      { no: "2", label: "(3) 国籍・地域", value: fmtVal(f.supporterNationality) },
      { no: "2", label: "(4) 在留カード番号", value: fmtVal(f.supporterResidenceCard), note: "日本国籍の場合は不要" },
      { no: "2", label: "(5) 在留資格", value: fmtVal(f.supporterStatusOfResidence) },
      { no: "2", label: "(6) 在留期間", value: fmtVal(f.supporterPeriodOfStay), note: "例：3年、1年" },
      { no: "2", label: "(7) 在留期間の満了日（年）", value: f.supporterPeriodExpiry ? new Date(f.supporterPeriodExpiry).getFullYear().toString() : "" },
      { no: "2", label: "(7) 在留期間の満了日（月）", value: f.supporterPeriodExpiry ? String(new Date(f.supporterPeriodExpiry).getMonth()+1) : "" },
      { no: "2", label: "(7) 在留期間の満了日（日）", value: f.supporterPeriodExpiry ? String(new Date(f.supporterPeriodExpiry).getDate()) : "" },
      { no: "2", label: "(8) 申請人との関係（続柄）", value: fmtVal(f.supporterRelationship), note: "夫/妻/父/母/養父/養母/その他" },
      { no: "2", label: "(9) 勤務先名称", value: fmtVal(f.supporterEmployer) },
      { no: "2", label: "(10) 法人番号（13桁）", value: fmtVal(f.supporterCorporateNumber) },
      { no: "2", label: "(11) 支店・事業所名", value: fmtVal(f.supporterBranchName) },
      { no: "2", label: "(12) 勤務先所在地", value: fmtVal(f.supporterAddress) },
      { no: "2", label: "(13) 年収（円）", value: fmtVal(f.supporterAnnualIncome) },
    ].forEach(row => { addRow(ws3, r3++, row); });
  }

  // ══════════════════════════════════════════════════════════════════════
  // Sheet 4: 取次者情報（全様式共通）
  // ══════════════════════════════════════════════════════════════════════
  const ws4 = wb.addWorksheet("取次者情報");
  addTitle(ws4, "取次者情報（全様式共通・固定）", "※ 毎回同じ内容をコピー＆ペーストしてください");
  setColumnWidths(ws4);
  let r4 = 4;

  addSectionHeader(ws4, r4++, "■ 取次者");
  [
    { no: "(1)", label: "氏名", value: "山口忠士", note: "固定値" },
    { no: "(3)", label: "所属機関等", value: "兵庫県行政書士会", note: "固定値" },
    { no: "(2)", label: "住所　郵便番号", value: "6650864", note: "ハイフンなし" },
    { no: "(2)", label: "住所　都道府県", value: "兵庫県", note: "固定値" },
    { no: "(2)", label: "住所　市区町村", value: "宝塚市泉町", note: "固定値" },
    { no: "(2)", label: "住所　番地・建物名", value: "22-25 島上マンション南棟1-B", note: "固定値" },
    { no: "", label: "電話番号", value: "090-2596-0128", note: "固定値" },
  ].forEach(row => { addRow(ws4, r4++, row); });

  // ── 出力 ──────────────────────────────────────────────────────────────
  const buf = await wb.xlsx.writeBuffer();
  const applicantName = `${f.familyNameEn ?? ""}${f.givenNameEn ?? ""}`;
  const fileName = `${app.caseNumber ?? id}_${applicantName}_オンライン申請用.xlsx`;

  return new NextResponse(Buffer.from(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}

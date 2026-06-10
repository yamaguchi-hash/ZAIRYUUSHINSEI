/**
 * 申請書PDF共通ヘルパー・スタイル・データ取得
 * ────────────────────────────────────────────
 * 申請人用・所属機関用の両ページから import して使用
 */
import { auth } from "@/lib/auth";
import { db, applications, applicantMaster, organizationMaster } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import type { ApplicationFormData, FamilyMember, WorkHistoryEntry } from "@/lib/form-types";
import { FORM_TYPE_LABELS, VISA_CATEGORY_NEEDS_ORG, OCCUPATION_TYPES } from "@/lib/form-types";
import { VISA_TYPE_LABELS } from "@/lib/utils";

// ─── フォーマッタ ─────────────────────────────────────────────────────────────
export function fmt(v: string | null | undefined) { return v || ""; }
export function fmtAddr(v: string | null | undefined) {
  if (!v) return "";
  const m = v.match(/^〒(\d{3})(\d{4})\|(.*)$/);
  if (m) return `〒${m[1]}-${m[2]}　${m[3] || ""}`.trim();
  return v;
}
export function fmtDate(v: string | null | undefined) {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}
export function fmtMoney(v: string | null | undefined) {
  if (!v) return "";
  const n = Number(String(v).replace(/,/g, ""));
  return isNaN(n) ? String(v) : `${n.toLocaleString()}円`;
}
export function yes(v: string | null | undefined): boolean {
  if (!v) return false;
  return v === "有" || v.startsWith("有（") || v === "あり" || v.startsWith("あり（");
}
export function fmtYesNo(v: string | null | undefined): string { return yes(v) ? "有" : "無"; }
export function fmtSex(v: string | null | undefined): string {
  if (!v) return "";
  if (v.startsWith("男")) return "男 Male";
  if (v.startsWith("女")) return "女 Female";
  return v;
}
export function fmtAdditionalOccupations(v: string | string[] | null | undefined): string {
  if (!v) return "";
  const codes = Array.isArray(v) ? v : String(v).split(",").map(s => s.trim()).filter(Boolean);
  if (codes.length === 0) return "";
  return codes.join(", ");
}

// ─── データ取得 ───────────────────────────────────────────────────────────────
export interface ShinseiData {
  app: any;
  applicant: any;
  org: any;
  form: Partial<ApplicationFormData>;
  familyMembers: FamilyMember[];
  workHistory: WorkHistoryEntry[];
  today: string;
  isChange: boolean;
}

export async function loadShinseiData(id: string): Promise<ShinseiData | null> {
  const session = await auth();
  const tenantId = (session?.user as any)?.tenantId;
  if (!tenantId) return null;

  const [app] = await db.select().from(applications)
    .where(and(eq(applications.id, id), eq(applications.tenantId, tenantId))).limit(1);
  if (!app) return null;

  const [applicant] = await db.select().from(applicantMaster)
    .where(eq(applicantMaster.id, app.applicantId)).limit(1);
  const org = app.organizationId
    ? await db.select().from(organizationMaster)
        .where(eq(organizationMaster.id, app.organizationId)).limit(1).then(r => r[0])
    : null;

  const form = (app.formData ?? {}) as Partial<ApplicationFormData>;
  const toFormType = (t: string) => {
    if (t === "coe" || t === "certification") return "coe";
    if (t === "change") return "change";
    if (t === "extension" || t === "renewal") return "extension";
    return "extension";
  };
  const formType = toFormType(form.applicationFormType ?? app.applicationType);
  const isChange = formType === "change";
  const now = new Date();
  const today = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;

  return {
    app, applicant, org, form,
    familyMembers: (form.familyInJapan ?? []) as FamilyMember[],
    workHistory: (form.workHistory ?? []) as WorkHistoryEntry[],
    today,
    isChange,
  };
}

// ─── 共通CSSスタイル ─────────────────────────────────────────────────────────
export const PRINT_STYLES = `
  *{box-sizing:border-box;margin:0;padding:0;}
  body{
    font-family:"MS Mincho","ＭＳ 明朝","Hiragino Mincho ProN","游明朝",serif;
    font-size:10px;color:#000;background:#f3f4f6;line-height:1.4;
  }
  @page{size:A4;margin:8mm 10mm;}
  .page{
    background:#fff;width:210mm;margin:0 auto;
    padding:8mm 12mm;min-height:297mm;position:relative;
    page-break-after:always;
  }
  .page:last-child{page-break-after:auto;}
  @media screen{
    .page{margin:16px auto;box-shadow:0 4px 20px rgba(0,0,0,.12);border-radius:4px;}
  }
  @media print{
    body{background:#fff;}
    *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}
    .page{padding:0;max-width:100%;min-height:auto;box-shadow:none;border-radius:0;}
    .no-print{display:none!important;}
  }

  .form-header{text-align:center;margin-bottom:6px;}
  .form-header .gov{font-size:8px;color:#333;margin-bottom:2px;}
  .form-header .form-number{font-size:8px;color:#333;margin-bottom:4px;}
  .form-header .form-title-box{
    border:1.5px solid #000;padding:5px 16px;display:inline-block;
    font-size:13px;font-weight:bold;letter-spacing:0.08em;
  }
  .form-header .form-title-en{font-size:8.5px;font-weight:normal;letter-spacing:0.02em;margin-top:1px;}
  .form-header .part-label{font-size:10px;font-weight:bold;margin-top:5px;letter-spacing:0.05em;}
  .form-header .part-label-en{font-size:8px;font-weight:normal;color:#333;}
  .form-header .part-label-v{font-size:9px;font-weight:bold;margin-top:4px;letter-spacing:0.03em;}

  table{width:100%;border-collapse:collapse;margin-bottom:4px;}
  td,th{border:0.5px solid #000;padding:2px 5px;vertical-align:middle;font-size:9.5px;line-height:1.35;}
  .lbl{background:#e8e8e8;font-weight:bold;white-space:nowrap;}
  .lbl-wrap{white-space:normal!important;word-break:break-word;overflow-wrap:break-word;line-height:1.25;}

  .section-title{
    background:#000;color:#fff;font-weight:bold;font-size:9.5px;
    padding:3px 7px;margin:6px 0 3px;letter-spacing:0.03em;
  }
  .sub-title{
    font-weight:bold;font-size:9px;padding:2px 0 1px;margin:4px 0 2px;
    border-bottom:0.5px solid #666;
  }
  .item-title{font-size:9px;font-weight:bold;margin:3px 0 1px;}

  .v-tbl{table-layout:fixed;}
  .v-tbl td,.v-tbl th{word-break:break-word;overflow-wrap:break-word;white-space:normal;}
  .v-tbl .lbl{white-space:normal;word-break:break-word;overflow-wrap:break-word;line-height:1.25;}

  .sign-table td{border:0.5px solid #000;}
  .sign-row{height:42px;}

  .page-footer{
    position:absolute;bottom:8mm;left:12mm;right:12mm;
    font-size:7.5px;color:#999;display:flex;justify-content:space-between;
    border-top:0.5px solid #ccc;padding-top:3px;
  }
  @media print{.page-footer{position:fixed;bottom:0;left:0;right:0;padding:0 10mm 5mm;}}

  .bilingual{font-size:7.5px;color:#333;font-weight:normal;}
  .bilingual-block{display:block;font-size:7.5px;color:#333;font-weight:normal;line-height:1.2;}

  th{background:#ddd;font-weight:bold;}

  /* 署名日の表示/非表示 */
  .sign-date{transition:visibility 0s;white-space:nowrap;}
  body.hide-sign-date .sign-date{visibility:hidden;}
  @media print{body.hide-sign-date .sign-date{visibility:hidden!important;}}

  /* 生年月日の表示/非表示 */
  .dob-value{transition:visibility 0s;}
  body.hide-dob .dob-value{visibility:hidden;}
  @media print{body.hide-dob .dob-value{visibility:hidden!important;}}
`;

// ─── 住所構築ヘルパー ─────────────────────────────────────────────────────────
export function buildAddress(form: Partial<ApplicationFormData>): string {
  const zip = form.postalCodeInJapan;
  const pref = form.prefectureInJapan;
  const city = form.cityInJapan;
  const line = form.addressLineInJapan;
  if (pref || city || line) {
    return `${zip ? "〒" + zip + "　" : ""}${pref ?? ""}${city ?? ""}${line ?? ""}`;
  }
  return `${zip ? "〒" + zip + "　" : ""}${fmt(form.addressInJapan)}`;
}

// ─── 印刷ツールバー（共通） ──────────────────────────────────────────────────
export function PrintToolbar({ applicationId, label }: { applicationId: string; label: string }) {
  return null; // Client Component として別途作成
}

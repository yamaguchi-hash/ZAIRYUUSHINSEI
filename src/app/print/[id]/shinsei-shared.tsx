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

// ═════════════════════════════════════════════════════════════════════════════
// 共通UIデザインシステム（全申請書フォーマット統一CSS）
// ─────────────────────────────────────────────────────────────────────────────
// ・フォント／テーブル／枠線／ヘッダー／署名欄を全種類の申請書で共通化
// ・印刷時はA4固定ページを廃して連続フローにし、印刷枚数を最小化
//   （強制改ページなし。改行は行単位の break-inside: avoid で制御）
// ═════════════════════════════════════════════════════════════════════════════
export const PRINT_STYLES = `
  *{box-sizing:border-box;margin:0;padding:0;}
  body{
    font-family:"MS Mincho","ＭＳ 明朝","Hiragino Mincho ProN","游明朝",serif;
    font-size:10px;color:#000;background:#f3f4f6;line-height:1.4;
  }
  @page{size:A4;margin:7mm 9mm;}

  /* ── 画面表示: A4カードとしてプレビュー ── */
  .page{
    background:#fff;width:210mm;margin:0 auto;
    padding:8mm 12mm;min-height:297mm;position:relative;
  }
  @media screen{
    .page{margin:16px auto;box-shadow:0 4px 20px rgba(0,0,0,.12);border-radius:4px;}
  }

  /* ── 印刷: 連続フローで枚数最小化 ── */
  @media print{
    body{background:#fff;font-size:8.5px;line-height:1.25;}
    *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}
    .no-print{display:none!important;}
    /* A4固定・強制改ページを解除し、内容量に応じて自然に流す */
    .page{
      width:auto;max-width:100%;min-height:0;
      padding:0;margin:0;box-shadow:none;border-radius:0;
      page-break-after:auto;break-after:auto;
    }
    .page + .page{margin-top:5mm;}
    /* 行・署名欄・ヘッダーの途中分断のみ防止（テーブル自体は分割可） */
    tr{break-inside:avoid;page-break-inside:avoid;}
    thead{display:table-header-group;}
    .sign-section,.form-header,.item-title{break-inside:avoid;page-break-inside:avoid;}
    .item-title{break-after:avoid;page-break-after:avoid;}
    /* 余白・行間・フォントを圧縮 */
    td,th{padding:1.5px 4px;font-size:8.5px;line-height:1.22;}
    table{margin-bottom:3px;}
    .form-header{margin-bottom:4px;}
    .bilingual,.bilingual-block{font-size:6.8px;line-height:1.1;}
  }

  /* ── 申請書ヘッダー（全様式共通） ── */
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

  /* ── テーブル（全様式共通: 枠線0.5px・ラベル網掛け） ── */
  table{width:100%;border-collapse:collapse;margin-bottom:4px;}
  td,th{border:0.5px solid #000;padding:2px 5px;vertical-align:middle;font-size:9.5px;line-height:1.35;}
  th{background:#ddd;font-weight:bold;}
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

  .bilingual{font-size:7.5px;color:#333;font-weight:normal;}
  .bilingual-block{display:block;font-size:7.5px;color:#333;font-weight:normal;line-height:1.2;}

  /* ══ 役割別署名欄（全様式共通コンポーネント） ══════════════════════════════ */
  .sign-section{margin-top:10px;border:1.2px solid #000;}
  /* 役割見出し: 【申請人署名欄】等を大きく明記 */
  .sign-role-label{
    background:#1a1a1a;color:#fff;font-size:11px;font-weight:bold;
    letter-spacing:0.25em;padding:4px 10px;
  }
  .sign-declaration{
    font-size:9px;font-weight:bold;text-align:center;background:#f0f0f0;
    padding:3px 6px;border-bottom:0.5px solid #000;
  }
  .sign-declaration .bilingual-block{font-weight:normal;}
  .sign-body{display:flex;align-items:stretch;}
  .sign-label-cell{
    flex:0 0 34%;background:#e8e8e8;border-right:0.5px solid #000;
    padding:5px 8px;font-size:9px;font-weight:bold;line-height:1.3;
  }
  .sign-area-cell{flex:1 1 auto;padding:6px 10px;min-height:52px;display:flex;align-items:center;}
  .sign-date-cell{
    flex:0 0 24%;border-left:0.5px solid #000;display:flex;flex-direction:column;
  }
  .sign-date-cell .sign-date-head{
    background:#e8e8e8;font-size:8.5px;font-weight:bold;text-align:center;
    padding:2px;border-bottom:0.5px solid #000;
  }
  .sign-date-cell .sign-date-value{
    flex:1;display:flex;align-items:center;justify-content:center;font-size:9.5px;
  }
  /* 手書き署名ライン（申請人・扶養者用） */
  .sign-line{
    width:100%;border-bottom:0.8px solid #000;height:34px;
  }
  /* 所属機関: 記名＋押印ブロック */
  .org-sign-block{display:flex;align-items:center;width:100%;gap:10px;}
  .org-sign-names{flex:1 1 auto;}
  .org-sign-company{font-size:11.5px;font-weight:bold;letter-spacing:0.05em;}
  .org-sign-rep{font-size:10.5px;margin-top:5px;}
  .stamp-box{
    flex:0 0 auto;width:21mm;height:21mm;
    border:1.2px solid #999;border-radius:2px;
    display:flex;align-items:center;justify-content:center;
    color:#aaa;font-size:9px;letter-spacing:0.1em;
  }

  /* ── 署名日（令和 年 月 日）の表示/非表示切り替え ── */
  .sign-date{transition:visibility 0s;white-space:nowrap;}
  body.hide-sign-date .sign-date{visibility:hidden;}
  @media print{body.hide-sign-date .sign-date{visibility:hidden!important;}}

  /* ── 生年月日の表示/非表示切り替え ── */
  .dob-value{transition:visibility 0s;}
  body.hide-dob .dob-value{visibility:hidden;}
  @media print{body.hide-dob .dob-value{visibility:hidden!important;}}
`;

// ═════════════════════════════════════════════════════════════════════════════
// 共通テンプレートコンポーネント
// ═════════════════════════════════════════════════════════════════════════════

/** 申請書ヘッダー（全様式共通） */
export function FormHeader({
  formNumber, title, titleEn, partLabel, partLabelEn, partLabelV, showGov,
}: {
  /** 様式番号（例: 別記第三十号様式（第二十条関係）） */
  formNumber?: string;
  /** 様式タイトル（例: 在留資格変更許可申請書）— 枠付き表示 */
  title?: string;
  titleEn?: string;
  /** 作成用ラベル（例: 申請人等作成用　１） */
  partLabel: string;
  partLabelEn?: string;
  /** V型ラベル（例: Ｖ（「特定技能（１号）」・「特定技能（２号）」）） */
  partLabelV?: string;
  /** 「日本国政府法務省」行の表示 */
  showGov?: boolean;
}) {
  return (
    <div className="form-header">
      {showGov && <div className="gov">日本国政府法務省　Ministry of Justice, Government of Japan</div>}
      {formNumber && <div className="form-number">{formNumber}</div>}
      {title && (
        <div className="form-title-box">
          {title}
          {titleEn && <div className="form-title-en">{titleEn}</div>}
        </div>
      )}
      <div className="part-label">{partLabel}</div>
      {partLabelV && <div className="part-label-v">{partLabelV}</div>}
      {partLabelEn && <div className="part-label-en">{partLabelEn}</div>}
    </div>
  );
}

/** 署名欄の役割種別 */
export type SignatureRole = "applicant" | "organization" | "supporter";

const SIGNATURE_META: Record<SignatureRole, {
  heading: string;
  line: string;
  lineEn: string;
}> = {
  applicant: {
    heading: "【申請人署名欄】",
    line: "申請人（法定代理人）の署名／申請書作成年月日",
    lineEn: "Signature of the applicant (legal representative) / Date of filling in this form",
  },
  organization: {
    heading: "【所属機関署名欄】",
    line: "特定技能所属機関名，代表者氏名の記名／申請書作成年月日",
    lineEn: "Name of the organization and representative of the organization / Date of filling in this form",
  },
  supporter: {
    heading: "【扶養者署名欄】",
    line: "扶養者の署名／申請書作成年月日",
    lineEn: "Signature of the supporter / Date of filling in this form",
  },
};

/**
 * 役割別署名欄（全様式共通テンプレート）
 * - applicant / supporter: 手書き署名ライン（空欄）
 * - organization: 会社名・代表者役職・代表者氏名を自動記名＋角印スペース
 * - 署名日セルは .sign-date クラスでツールバーから表示/非表示を切り替え
 */
export function SignatureSection({
  role,
  orgName,
  representativeTitle,
  representativeName,
  signDate,
}: {
  role: SignatureRole;
  /** organization 用: 会社名（所属機関名） */
  orgName?: string;
  /** organization 用: 代表者の役職 */
  representativeTitle?: string;
  /** organization 用: 代表者氏名 */
  representativeName?: string;
  /** 実データの署名日（あれば「令和」形式で出力。なければ空欄の年月日） */
  signDate?: string;
}) {
  const meta = SIGNATURE_META[role];

  // 署名日表示: 実データがあれば和暦表記、なければ手書き用の空欄
  const dateDisplay = (() => {
    if (signDate) {
      const d = new Date(signDate);
      if (!isNaN(d.getTime())) {
        const reiwaYear = d.getFullYear() - 2018;
        return `令和${reiwaYear}年${d.getMonth() + 1}月${d.getDate()}日`;
      }
    }
    return "令和　　年　　月　　日";
  })();

  return (
    <div className="sign-section">
      {/* 役割見出し */}
      <div className="sign-role-label">{meta.heading}</div>
      {/* 宣誓文 */}
      <div className="sign-declaration">
        以上の記載内容は事実と相違ありません。
        <span className="bilingual-block">
          I hereby declare that the statement given above is true and correct.
        </span>
      </div>
      {/* 署名行 */}
      <div className="sign-body">
        <div className="sign-label-cell">
          {meta.line}
          <span className="bilingual-block">{meta.lineEn}</span>
        </div>
        <div className="sign-area-cell">
          {role === "organization" ? (
            /* 所属機関: 自動記名 ＋ 角印スペース */
            <div className="org-sign-block">
              <div className="org-sign-names">
                <div className="org-sign-company">{orgName || "　"}</div>
                <div className="org-sign-rep">
                  {representativeTitle || ""}
                  {representativeTitle && representativeName ? "　" : ""}
                  {representativeName || ""}
                </div>
              </div>
              <div className="stamp-box">（印）</div>
            </div>
          ) : (
            /* 申請人・扶養者: 手書き署名ライン */
            <div className="sign-line" />
          )}
        </div>
        <div className="sign-date-cell">
          <div className="sign-date-head">申請書作成年月日<br /><span className="bilingual">Date</span></div>
          <div className="sign-date-value">
            <span className="sign-date">{dateDisplay}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

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


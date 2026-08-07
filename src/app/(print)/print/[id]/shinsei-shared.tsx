/**
 * 申請書PDF共通ヘルパー・スタイル・データ取得
 * ────────────────────────────────────────────
 * 申請人用・所属機関用の両ページから import して使用
 */
import { auth } from "@/lib/auth";
import { db, applications, applicantMaster, organizationMaster } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import type { ApplicationFormData, ApplicationFormType, FamilyMember, WorkHistoryEntry } from "@/lib/form-types";
import { FORM_TYPE_LABELS, FORM_TYPE_ARTICLE, VISA_CATEGORY_NEEDS_ORG, OCCUPATION_TYPES, BUSINESS_TYPES } from "@/lib/form-types";
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
export function businessTypeLabel(code: string): string {
  if (!code) return "　";
  const num = Number(code);
  const hit = BUSINESS_TYPES.find(b => b.code === num);
  return hit ? `${num}.${hit.label}` : `${code}`;
}
export function occupationLabel(code: string): string {
  if (!code) return "　";
  const num = Number(code);
  const hit = OCCUPATION_TYPES.find(o => o.code === num);
  return hit ? `${num}.${hit.label}` : `${code}`;
}
/** is2Goがtrueの場合、表示値を「省略」に置き換える（特定技能1号の場合のみ必要な項目用） */
export function omitFor2Go(is2Go: boolean, formattedValue: string): string {
  return is2Go ? "省略" : formattedValue;
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
  /** 申請書類の種別（coe/change/extension/permanent） */
  formType: ApplicationFormType;
  /** 申請書類の種別が COE（在留資格認定証明書交付申請）か */
  isCoe: boolean;
  /** 在留資格カテゴリ（N/L/I/T/R/P/V） */
  cat: string;
  isNtype: boolean;
  isTtype: boolean;
  isRtype: boolean;
  isPtype: boolean;
  /** 特定技能（１号・２号） */
  isVtype: boolean;
  /** 所属機関情報の記載が必要な区分か */
  needsOrg: boolean;
  /** 特定技能2号を選択しているか（1号の場合のみ必要な項目をPDF上で「省略」と表示するために使う） */
  is2Go: boolean;
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
  const toFormType = (t: string): ApplicationFormType => {
    if (t === "coe" || t === "certification") return "coe";
    if (t === "change") return "change";
    if (t === "extension" || t === "renewal") return "extension";
    if (t === "permanent" || t === "permanent_residence") return "permanent";
    return "extension";
  };
  const formType = toFormType(form.applicationFormType ?? app.applicationType);
  const isCoe = formType === "coe";
  const isChange = formType === "change";
  const now = new Date();
  const today = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;

  // 在留資格カテゴリ
  const cat = form.visaFormCategory ?? 'N';
  const isNtype = ['N', 'L', 'I'].includes(cat);
  const isTtype = cat === 'T';
  const isRtype = cat === 'R';
  const isPtype = cat === 'P';
  const isVtype = cat === 'V';   // 特定技能（１号・２号）
  const needsOrg = VISA_CATEGORY_NEEDS_ORG[cat as keyof typeof VISA_CATEGORY_NEEDS_ORG] ?? false;
  // 特定技能2号を選択している場合、特定技能1号の場合のみ記入の項目をPDF上で「省略」と表示する。
  // 判定式はshinsei-form-editor.tsxのis2Goと完全に一致させること。
  const is2Go = isVtype && form.desiredStatusOfResidence === '特定技能2号';

  return {
    app, applicant, org, form,
    // 在日親族及び同居者: フォームで「無」を選択している場合は、配列に入力済み
    // データが残っていてもPDFには出さない（「なし（None）」表示にする）
    familyMembers: (form.familyInJapanExists === "無" ? [] : (form.familyInJapan ?? [])) as FamilyMember[],
    workHistory: (form.workHistory ?? []) as WorkHistoryEntry[],
    today,
    isChange,
    formType,
    isCoe,
    cat, isNtype, isTtype, isRtype, isPtype, isVtype, needsOrg, is2Go,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 様式番号・タイトルのマッピング（書類種別ごとに動的に切り替える）
// ─────────────────────────────────────────────────────────────────────────────
// 申請書のヘッド部分に表示する「様式番号」「申請書タイトル（和文・英文）」は、
// 申請書類の種別（formType: coe/change/extension/permanent）によって異なる。
// すべてのページで同じレイアウトの FormHeader を使い、ここで定義した値を
// formType（必要に応じて在留資格カテゴリ cat も）に応じて切り替えることで、
// デザインは統一しつつ様式番号・タイトルだけが正しく動的に変わるようにする。
//
// 在留資格カテゴリ（cat）ごとに様式番号を変える必要が生じた場合は、
// getFormNumber() 内に cat による分岐・専用マップを追加すればよい。
// ═════════════════════════════════════════════════════════════════════════════
export const FORM_NUMBER_MAP: Record<ApplicationFormType, string> = {
  coe:       "別記第六号の三様式（第六条の二関係）",
  change:    "別記第三十号様式（第二十条関係）",
  extension: "別記第三十号の二様式（第二十一条関係）",
  permanent: "別記第三十六号様式（第二十二条関係）",
};

export const FORM_TITLE_MAP: Record<ApplicationFormType, { ja: string; en: string }> = {
  coe: {
    ja: "在留資格認定証明書交付申請書",
    en: "APPLICATION FOR CERTIFICATE OF ELIGIBILITY",
  },
  change: {
    ja: "在留資格変更許可申請書",
    en: "APPLICATION FOR CHANGE OF STATUS OF RESIDENCE",
  },
  extension: {
    ja: "在留期間更新許可申請書",
    en: "APPLICATION FOR EXTENSION OF PERIOD OF STAY",
  },
  permanent: {
    ja: "永住許可申請書",
    en: "APPLICATION FOR PERMISSION FOR PERMANENT RESIDENCE",
  },
};

/** 様式番号を取得する（書類種別が主軸。在留資格カテゴリ別の例外があればここに追加） */
export function getFormNumber(formType: ApplicationFormType, cat?: string): string {
  return FORM_NUMBER_MAP[formType] ?? FORM_NUMBER_MAP.change;
}

/** PDFヘッダーに表示する「様式名－在留資格種類」ラベルを返す（例: 在留資格変更許可申請書－家族滞在） */
export function getPdfHeaderCategoryLabel(formType: ApplicationFormType, visaType: string): string {
  const title = FORM_TITLE_MAP[formType]?.ja ?? FORM_TITLE_MAP.change.ja;
  const visaLabel = VISA_TYPE_LABELS[visaType] ?? visaType;
  return `${title}－${visaLabel}`;
}

/** 手続き種類（在留手続きの種類）の短縮ラベル。ファイル名等に使う。 */
const PROCEDURE_SHORT_LABEL: Record<ApplicationFormType, string> = {
  coe: "認定",
  change: "変更",
  extension: "更新",
  permanent: "永住",
};

/**
 * 申請書PDFの保存名ベースを組み立てる。
 * 「申請書　<申請人用/所属機関用>　<手続き種類(更新/変更/認定/永住)>　<在留資格>　<申請人名>」。
 * 日付（保存日）はクライアント側（ShinseiPrintToolbar）で末尾に付与する。
 */
export function buildShinseiFileNameBase(
  role: "申請人用" | "所属機関用",
  formType: ApplicationFormType,
  visaType: string,
  form: { familyNameEn?: string; givenNameEn?: string; familyNameJa?: string; givenNameJa?: string },
): string {
  const procedure = PROCEDURE_SHORT_LABEL[formType] ?? "";
  const visaLabel = VISA_TYPE_LABELS[visaType] ?? visaType;
  const nameJa = [form.familyNameJa, form.givenNameJa].filter(Boolean).join(" ").trim();
  const nameEn = [form.familyNameEn, form.givenNameEn].filter(Boolean).join(" ").trim();
  const name = nameJa || nameEn;
  return ["申請書", role, procedure, visaLabel, name].filter((p) => p && p.trim()).join("　");
}

// 申請書冒頭の申請文（和文・英文）。法令上の根拠条文（FORM_TYPE_ARTICLE）と
// 申請内容（交付／変更／更新／許可）を formType ごとに組み合わせる。
export const FORM_DECLARATION_MAP: Record<ApplicationFormType, { ja: string; en: string }> = {
  coe: {
    ja: `${FORM_TYPE_ARTICLE.coe}に基づき，次のとおり在留資格認定証明書の交付を申請します。`,
    en: "Pursuant to the provisions of Article 7-2 of the Immigration Control and Refugee Recognition Act, I hereby apply for a certificate of eligibility as follows.",
  },
  change: {
    ja: `${FORM_TYPE_ARTICLE.change}に基づき，次のとおり在留資格の変更を申請します。`,
    en: "Pursuant to the provisions of Article 20, Paragraph 2 of the Immigration Control and Refugee Recognition Act, I hereby apply for change of status of residence as follows.",
  },
  extension: {
    ja: `${FORM_TYPE_ARTICLE.extension}に基づき，次のとおり在留期間の更新を申請します。`,
    en: "Pursuant to the provisions of Article 21, Paragraph 2 of the Immigration Control and Refugee Recognition Act, I hereby apply for extension of period of stay as follows.",
  },
  permanent: {
    ja: `${FORM_TYPE_ARTICLE.permanent}に基づき，次のとおり永住許可を申請します。`,
    en: "Pursuant to the provisions of Article 22, Paragraph 2 of the Immigration Control and Refugee Recognition Act, I hereby apply for permission for permanent residence as follows.",
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// PDF/印刷の幅設定
// ─────────────────────────────────────────────────────────────────────────────
// 申請書PDFのレイアウト幅を一括調整したい場合は、この値を変更するだけでよい。
// PRINT_STYLES内の `--pdf-print-width` CSS変数として全ページの .page に反映される。
// ═════════════════════════════════════════════════════════════════════════════
export const PDF_PRINT_WIDTH = "210mm";

// ═════════════════════════════════════════════════════════════════════════════
// 共通UIデザインシステム（全申請書フォーマット統一CSS）
// ─────────────────────────────────────────────────────────────────────────────
// ・フォント／テーブル／枠線／ヘッダー／署名欄を全種類の申請書で共通化
// ・印刷時はA4固定ページを廃して連続フローにし、印刷枚数を最小化
//   （強制改ページなし。改行は行単位の break-inside: avoid で制御）
// ═════════════════════════════════════════════════════════════════════════════
export const PRINT_STYLES = `
  /* ── PDF/印刷の幅調整: ここを変更すると全体の幅が追従する ── */
  :root{
    --pdf-print-width: ${PDF_PRINT_WIDTH};
  }

  *{box-sizing:border-box;margin:0;padding:0;}
  body{
    font-family:"MS Mincho","ＭＳ 明朝","Hiragino Mincho ProN","游明朝",serif;
    font-size:10px;color:#000;background:#f3f4f6;line-height:1.4;
  }
  /* PDFの実際の用紙幅も --pdf-print-width に連動させる。
     ※ @page の size は CSS変数(var())を解釈できないため、PDF_PRINT_WIDTH の値を
        直接埋め込んでいる。PDF_PRINT_WIDTH は "210mm" のような長さ単位で指定すること。 */
  @page{size:${PDF_PRINT_WIDTH} 297mm;margin:7mm 9mm;}

  /* ── 画面表示: A4カードとしてプレビュー ── */
  .page{
    background:#fff;width:var(--pdf-print-width);max-width:var(--pdf-print-width);margin:0 auto;
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
    /* A4固定・強制改ページを解除し、内容量に応じて自然に流す（印刷枚数の最小化）。
       .page の幅は @page で確保した用紙幅いっぱい(100%)に追従させる。
       table 等の内部要素は width:100% / 列は%指定のため、ここに連動して伸縮する。
       実際の印刷枚数に一致するページ番号は PageNumberStamp が印刷実行時
       （beforeprint）に物理シート数を計測して .print-sheet-stamp として付与する。 */
    .page{
      width:100%;max-width:100%;min-height:0;
      padding:0;margin:0 auto;box-shadow:none;border-radius:0;
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

  /* ── 印刷枚数の計測モード（body.print-measure） ──────────────────────────
     beforeprint の時点ではブラウザは画面用CSSのままレイアウトしているため、
     PageNumberStamp が枚数を実測する間だけこのクラスを body に付与し、
     上の @media print と同じコンパクトレイアウトを画面上で再現する。
     ※ @media print のレイアウトに影響する値を変更した場合は、ここも必ず同期させること */
  body.print-measure{
    background:#fff;font-size:8.5px;line-height:1.25;
    width:calc(var(--pdf-print-width) - var(--print-margin-side, 9mm)*2);
    margin:0;
  }
  body.print-measure .no-print{display:none!important;}
  body.print-measure .page{
    width:100%!important;max-width:100%!important;min-height:0!important;
    padding:0!important;margin:0 auto!important;box-shadow:none!important;border-radius:0!important;
  }
  body.print-measure .page + .page{margin-top:5mm!important;}
  body.print-measure td,body.print-measure th{padding:1.5px 4px;font-size:8.5px;line-height:1.22;}
  body.print-measure table{margin-bottom:3px;}
  body.print-measure .form-header{margin-bottom:4px;}
  body.print-measure .bilingual,body.print-measure .bilingual-block{font-size:6.8px;line-height:1.1;}

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

  /* ── N/T/R/P型コンテンツ移植用（shinsei.tsxの局所スタイルから移植） ── */
  .section{background:#1c1c1c;color:#fff;font-weight:bold;font-size:11.5px;padding:5px 9px;margin:14px 0 5px;letter-spacing:0.03em;}
  .section2{background:#444;color:#fff;font-size:10.5px;padding:3px 8px;margin:8px 0 4px;}
  .section3{background:#777;color:#fff;font-size:10px;padding:3px 7px;margin:5px 0 3px;}
  .sign-table td{height:44px;}
  .seal-box{
    width:40px;height:40px;border:1px dashed #ff0000;border-radius:50%;
    color:#ff0000;text-align:center;line-height:40px;font-size:8pt;flex-shrink:0;
  }
  .role-banner{
    text-align:center;font-size:10px;font-weight:bold;letter-spacing:0.15em;
    background:#000;color:#fff;padding:3px 0;margin-bottom:2px;
  }
  /* ページ右上の書類種別スタンプ（画面プレビュー用・PageNumberStampがJSで各カードに付与） */
  .page-number-stamp{
    position:absolute;top:2mm;right:2mm;z-index:50;
    font-size:9px;font-weight:bold;letter-spacing:0.03em;white-space:nowrap;
    background:#1e3a8a;color:#fff;padding:2px 8px;border-radius:3px;
    -webkit-print-color-adjust:exact;print-color-adjust:exact;
  }
  /* 印刷用: 実際の印刷シートごとの右上スタンプ（beforeprintで物理枚数を計測して付与） */
  .print-sheet-stamp{display:none;}
  @media print{
    body{position:relative;}
    /* 画面用スタンプは印刷に含めない（印刷はシート単位のスタンプに置き換える） */
    .page-number-stamp{display:none!important;}
    /* ページ番号は各ページ右上に「種別 n/総数」バッジとして表示（例 申請人用 1/2）。
       JSが各物理シート先頭の top を設定し、ここで右端に寄せる。 */
    .print-sheet-stamp{
      display:block;position:absolute;right:2mm;z-index:50;white-space:nowrap;
      font-size:9px;font-weight:bold;letter-spacing:0.03em;
      background:#1e3a8a;color:#fff;padding:2px 8px;border-radius:3px;
      -webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;
    }
  }

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
`;

// ═════════════════════════════════════════════════════════════════════════════
// 共通テンプレートコンポーネント
// ═════════════════════════════════════════════════════════════════════════════

/** 申請書ヘッダー（全様式共通） */
export function FormHeader({
  formNumber, title, titleEn, categoryLabel, showGov,
}: {
  /** 様式番号（例: 別記第三十号様式（第二十条関係）） */
  formNumber?: string;
  /** 様式タイトル（例: 在留資格変更許可申請書）— 枠付き表示 */
  title?: string;
  titleEn?: string;
  /** 様式名－在留資格種類（例: 在留資格変更許可申請書－家族滞在） */
  categoryLabel: string;
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
      <div className="part-label">{categoryLabel}</div>
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

/**
 * 取次者情報欄（全様式共通・固定内容）
 * - full: ラベル2列×値2列のグリッド表示（bilingual付き）
 * - compact: ラベル1列・値1列の縦積み表示（bilingualなし）
 */
export function AgentSection({ variant = "full" }: { variant?: "full" | "compact" } = {}) {
  if (variant === "compact") {
    return (
      <>
        <div className="section3" style={{ marginTop: "10px" }}>※ 取次者</div>
        <table>
          <tbody>
            <tr>
              <td className="lbl" style={{ width: "20%" }}>(1) 氏名</td>
              <td colSpan={3}>山口忠士</td>
            </tr>
            <tr>
              <td className="lbl">(3) 所属機関等</td>
              <td colSpan={3}>兵庫県行政書士会</td>
            </tr>
            <tr>
              <td className="lbl">(2) 住所</td>
              <td colSpan={3}>〒665-0864 兵庫県宝塚市泉町22-25 島上マンション南棟1-B</td>
            </tr>
            <tr>
              <td className="lbl">電話番号</td>
              <td colSpan={3}>090-2596-0128</td>
            </tr>
          </tbody>
        </table>
      </>
    );
  }
  return (
    <>
      <div className="item-title" style={{ marginTop: "10px" }}>
        ※ 取次者
        <span className="bilingual">　Agent or other authorized person</span>
      </div>
      <table style={{ fontSize: "9px" }}><tbody>
        <tr>
          <td className="lbl" style={{ width: "20%" }}>(1) 氏名<br /><span className="bilingual">Name</span></td>
          <td style={{ width: "30%" }}>山口忠士</td>
          <td className="lbl" style={{ width: "20%" }}>(2) 住所<br /><span className="bilingual">Address</span></td>
          <td style={{ width: "30%" }}>〒665-0864 兵庫県宝塚市泉町22-25 島上マンション南棟1-B</td>
        </tr>
        <tr>
          <td className="lbl">(3) 所属機関等<br /><span className="bilingual">Organization</span></td>
          <td>兵庫県行政書士会</td>
          <td className="lbl">電話番号<br /><span className="bilingual">Telephone No.</span></td>
          <td>090-2596-0128</td>
        </tr>
      </tbody></table>
    </>
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


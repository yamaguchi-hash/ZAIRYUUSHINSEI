/**
 * 質問書のテキストコンテンツを返す API
 * クライアント側でGoogleドキュメントにコピー＆ペーストするために使用
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, applications, applicantMaster } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import type { ApplicationFormData } from "@/lib/form-types";

interface Question {
  key: keyof ApplicationFormData;
  section: string;
  label: string;
  note?: string;
  formTypes?: string[];
  categories?: string[];
  options?: string[];
}

const ALL_QUESTIONS: Question[] = [
  { key: "nationality",    section: "基本情報", label: "1. 国籍・地域", note: "例：中国、ベトナム" },
  { key: "dateOfBirth",    section: "基本情報", label: "2. 生年月日", note: "例：1990年3月15日" },
  { key: "familyNameEn",   section: "基本情報", label: "3. 氏名（ローマ字・姓 / Family Name）", note: "例：YAMADA" },
  { key: "givenNameEn",    section: "基本情報", label: "3. 氏名（ローマ字・名 / Given Name）", note: "例：TARO" },
  { key: "familyNameJa",   section: "基本情報", label: "3. 氏名（漢字・姓）", note: "漢字氏名がある場合" },
  { key: "givenNameJa",    section: "基本情報", label: "3. 氏名（漢字・名）", note: "漢字氏名がある場合" },
  { key: "sex",            section: "基本情報", label: "4. 性別", options: ["男", "女"] },
  { key: "placeOfBirth",   section: "基本情報", label: "5. 出生地", note: "例：北京市", formTypes: ["coe", "change"] },
  { key: "maritalStatus",  section: "基本情報", label: "5（更新）/ 6. 配偶者の有無", options: ["有", "無"] },
  { key: "occupation",     section: "基本情報", label: "6（更新）/ 7. 職業", note: "例：会社員、主婦" },
  { key: "homeTownCity",   section: "基本情報", label: "7（更新）/ 8. 本国における居住地", note: "例：上海市徐匯区〇〇路1-2-3" },
  { key: "postalCodeInJapan",   section: "日本における連絡先", label: "郵便番号", note: "例：160-0023（7桁）" },
  { key: "prefectureInJapan",   section: "日本における連絡先", label: "都道府県", note: "例：東京都" },
  { key: "cityInJapan",         section: "日本における連絡先", label: "市区町村", note: "例：新宿区西新宿" },
  { key: "addressLineInJapan",  section: "日本における連絡先", label: "番地・建物名・部屋番号", note: "例：2-8-1 〇〇マンション 305号室" },
  { key: "telephoneNo",         section: "日本における連絡先", label: "電話番号（固定）", note: "例：03-1234-5678" },
  { key: "cellularPhoneNo",     section: "日本における連絡先", label: "携帯電話番号", note: "例：090-1234-5678" },
  { key: "passportNumber", section: "旅券（パスポート）", label: "旅券番号", note: "例：AB1234567（英数字）" },
  { key: "passportExpiry", section: "旅券（パスポート）", label: "旅券有効期限", note: "例：2028年12月31日" },
  { key: "currentStatusOfResidence", section: "現在の在留状況", label: "現在の在留資格", note: "例：家族滞在、技術・人文知識・国際業務" },
  { key: "currentPeriodOfStay",      section: "現在の在留状況", label: "在留期間", note: "例：1年、3年" },
  { key: "currentPeriodExpiry",      section: "現在の在留状況", label: "在留期間の満了日", note: "例：2025年10月15日" },
  { key: "residenceCardNumber",      section: "現在の在留状況", label: "在留カード番号", note: "例：AB12345678CD（英数字12桁）" },
  { key: "desiredStatusOfResidence", section: "申請内容", label: "希望する在留資格（変更の場合）", formTypes: ["change"] },
  { key: "desiredPeriodOfStay",      section: "申請内容", label: "希望する在留期間", note: "例：3年", formTypes: ["change", "extension"] },
  { key: "reasonForApplication",     section: "申請内容", label: "更新・変更の理由" },
  { key: "criminalRecord", section: "犯罪・退去強制歴", label: "犯罪を理由とする処分を受けたことの有無", note: "日本国外・交通違反等を含む", options: ["有", "無"] },
  { key: "marriageNotificationPlaceJapan",   section: "婚姻・出生届出（R型）", label: "日本国届出先", note: "例：東京都新宿区役所", categories: ["R"] },
  { key: "marriageNotificationDateJapan",    section: "婚姻・出生届出（R型）", label: "日本国届出年月日", note: "例：2020年5月1日", categories: ["R"] },
  { key: "marriageNotificationPlaceForeign", section: "婚姻・出生届出（R型）", label: "本国等届出先", categories: ["R"] },
  { key: "marriageNotificationDateForeign",  section: "婚姻・出生届出（R型）", label: "本国等届出年月日", categories: ["R"] },
  { key: "supporterFamilyNameEn",  section: "扶養者の情報（R型）", label: "扶養者 氏名（ローマ字・姓）", categories: ["R"] },
  { key: "supporterGivenNameEn",   section: "扶養者の情報（R型）", label: "扶養者 氏名（ローマ字・名）", categories: ["R"] },
  { key: "supporterFamilyNameJa",  section: "扶養者の情報（R型）", label: "扶養者 氏名（漢字・姓）", categories: ["R"] },
  { key: "supporterGivenNameJa",   section: "扶養者の情報（R型）", label: "扶養者 氏名（漢字・名）", categories: ["R"] },
  { key: "supporterDob",           section: "扶養者の情報（R型）", label: "扶養者 生年月日", categories: ["R"] },
  { key: "supporterNationality",   section: "扶養者の情報（R型）", label: "扶養者 国籍・地域", categories: ["R"] },
  { key: "supporterResidenceCard", section: "扶養者の情報（R型）", label: "扶養者 在留カード番号", categories: ["R"] },
  { key: "supporterStatusOfResidence", section: "扶養者の情報（R型）", label: "扶養者 在留資格", categories: ["R"] },
  { key: "supporterPeriodOfStay",  section: "扶養者の情報（R型）", label: "扶養者 在留期間", note: "例：3年", categories: ["R"] },
  { key: "supporterPeriodExpiry",  section: "扶養者の情報（R型）", label: "扶養者 在留期間の満了日", categories: ["R"] },
  { key: "supporterRelationship",  section: "扶養者の情報（R型）", label: "申請人との関係（続柄）", options: ["夫", "妻", "父", "母", "養父", "養母", "その他"], categories: ["R"] },
  { key: "supporterEmployer",      section: "扶養者の情報（R型）", label: "扶養者 勤務先名称", categories: ["R"] },
  { key: "supporterCorporateNumber", section: "扶養者の情報（R型）", label: "扶養者 法人番号（13桁）", categories: ["R"] },
  { key: "supporterBranchName",    section: "扶養者の情報（R型）", label: "扶養者 支店・事業所名", categories: ["R"] },
  { key: "supporterAddress",       section: "扶養者の情報（R型）", label: "扶養者 勤務先所在地", categories: ["R"] },
  { key: "supporterAnnualIncome",  section: "扶養者の情報（R型）", label: "扶養者 年収（円）", note: "例：5,000,000", categories: ["R"] },
  { key: "employerName",     section: "勤務先（N型）", label: "勤務先名称", categories: ["N","L","I","V"] },
  { key: "employerBranchName", section: "勤務先（N型）", label: "支店・事業所名", categories: ["N","L","I","V"] },
  { key: "employerAddress",  section: "勤務先（N型）", label: "勤務先所在地", categories: ["N","L","I","V"] },
  { key: "employerPhone",    section: "勤務先（N型）", label: "勤務先電話番号", categories: ["N","L","I","V"] },
  { key: "salary",           section: "勤務先（N型）", label: "給与・報酬（月額または年額）", note: "例：300,000円（月額）", categories: ["N","L","I","V"] },
  { key: "spouseFamilyNameEn", section: "配偶者・身元保証人（T型）", label: "配偶者 氏名（ローマ字・姓）", categories: ["T"] },
  { key: "spouseGivenNameEn",  section: "配偶者・身元保証人（T型）", label: "配偶者 氏名（ローマ字・名）", categories: ["T"] },
  { key: "spouseDob",          section: "配偶者・身元保証人（T型）", label: "配偶者 生年月日", categories: ["T"] },
  { key: "marriageDate",       section: "配偶者・身元保証人（T型）", label: "婚姻（届出）年月日", categories: ["T"] },
  { key: "marriageRegistrationPlace", section: "配偶者・身元保証人（T型）", label: "婚姻届出市区町村名", categories: ["T"] },
  { key: "schoolName",       section: "在籍学校（P型）", label: "学校名", categories: ["P"] },
  { key: "schoolType",       section: "在籍学校（P型）", label: "学校の種別", options: ["大学院","大学","短期大学","専門学校","高等学校","日本語学校","その他"], categories: ["P"] },
  { key: "enrollmentDate",   section: "在籍学校（P型）", label: "入学年月日", categories: ["P"] },
  { key: "annualTuition",    section: "在籍学校（P型）", label: "年間学費（円）", categories: ["P"] },
  { key: "fundingSource",    section: "在籍学校（P型）", label: "費用支弁方法", categories: ["P"] },
];

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined || v === "") return true;
  if (Array.isArray(v) && v.length === 0) return true;
  return false;
}

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

  const form = (app.formData ?? {}) as Partial<ApplicationFormData>;
  const toFormType = (t: string) => {
    if (t === "coe" || t === "certification") return "coe";
    if (t === "change") return "change";
    return "extension";
  };
  const formType = toFormType(form.applicationFormType ?? app.applicationType);
  const cat = (form.visaFormCategory ?? "N") as string;

  const emptyQuestions = ALL_QUESTIONS.filter((q) => {
    if (q.formTypes && !q.formTypes.includes(formType)) return false;
    if (q.categories && !q.categories.includes(cat)) return false;
    return isEmpty(form[q.key]);
  });

  const sections = emptyQuestions.reduce<Record<string, Question[]>>((acc, q) => {
    if (!acc[q.section]) acc[q.section] = [];
    acc[q.section].push(q);
    return acc;
  }, {});

  const today = new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });
  const applicantName = [applicant?.familyNameEn, applicant?.givenNameEn].filter(Boolean).join(" ") || "（氏名不明）";
  const title = `在留申請 質問書 — ${applicantName} (${app.caseNumber ?? id})`;

  // プレーンテキスト生成（Googleドキュメントにそのまま貼り付け可能）
  const lines: string[] = [];
  lines.push("在留申請　ご確認・ご記入のお願い");
  lines.push("");
  lines.push(`申請人：${applicantName}　|　案件番号：${app.caseNumber ?? ""}　|　作成日：${today}`);
  lines.push("");
  lines.push("━".repeat(60));
  lines.push("【お客様へ】");
  lines.push("下記の項目について、行政書士が申請書を作成するために必要な情報が不足しています。");
  lines.push("各質問に対してご回答をご記入のうえ、担当行政書士（090-2596-0128）までご返送ください。");
  lines.push("※ 記入漏れがある場合、申請書の提出が遅れる場合がございます。");
  lines.push("━".repeat(60));
  lines.push("");

  if (Object.keys(sections).length === 0) {
    lines.push("✅ 現時点で不足している情報はありません。");
  } else {
    for (const [section, questions] of Object.entries(sections)) {
      lines.push(`■ ${section}`);
      lines.push("─".repeat(40));
      for (const q of questions) {
        const labelText = q.note ? `【${q.label}】（${q.note}）` : `【${q.label}】`;
        lines.push(labelText);
        if (q.options && q.options.length > 0) {
          lines.push("　" + q.options.map(o => `☐ ${o}`).join("　　"));
        } else {
          lines.push("　回答：＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿");
        }
        lines.push("");
      }
    }
  }

  lines.push("━".repeat(60));
  lines.push("お客様署名・確認日：＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿");
  lines.push("");
  lines.push(`行政書士法人 JLS　山口忠士（yamaguchi@jls-gyosei.jp / 090-2596-0128）`);
  lines.push(`出力日：${today}　|　案件番号：${app.caseNumber ?? ""}`);

  // Apps Script 用の lines 構造も返す（Apps Script URL 設定済みの場合に questionnaire-gdoc が使う）
  const structuredLines = buildStructuredLines(applicantName, app.caseNumber, sections, today);

  return NextResponse.json({
    title,
    plainText: lines.join("\n"),
    lines: structuredLines,
  });
}

function buildStructuredLines(
  applicantName: string,
  caseNumber: string | null,
  sections: Record<string, Question[]>,
  today: string,
) {
  type Line = { type: string; text: string };
  const out: Line[] = [];
  out.push({ type: "title",  text: "在留申請　ご確認・ご記入のお願い" });
  out.push({ type: "meta",   text: `申請人：${applicantName}　|　案件番号：${caseNumber ?? ""}　|　作成日：${today}` });
  out.push({ type: "spacer", text: "" });
  out.push({ type: "instruction", text: "【お客様へ】" });
  out.push({ type: "instruction", text: "下記の項目について、行政書士が申請書を作成するために必要な情報が不足しています。" });
  out.push({ type: "instruction", text: "各質問に対してご回答をご記入のうえ、担当行政書士（090-2596-0128）までご返送ください。" });
  out.push({ type: "instruction", text: "※ 記入漏れがある場合、申請書の提出が遅れる場合がございます。" });
  out.push({ type: "spacer", text: "" });
  for (const [section, questions] of Object.entries(sections)) {
    out.push({ type: "section", text: `■ ${section}` });
    for (const q of questions) {
      const labelText = q.note ? `${q.label}　（${q.note}）` : q.label;
      out.push({ type: "question", text: labelText });
      if (q.options && q.options.length > 0) {
        out.push({ type: "options", text: q.options.map(o => `☐ ${o}`).join("　　") });
      } else {
        out.push({ type: "answer", text: "回答：＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿" });
      }
    }
    out.push({ type: "spacer", text: "" });
  }
  out.push({ type: "instruction", text: `お客様署名・確認日：＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿` });
  out.push({ type: "instruction", text: `行政書士法人 JLS　山口忠士（yamaguchi@jls-gyosei.jp / 090-2596-0128）` });
  return out;
}

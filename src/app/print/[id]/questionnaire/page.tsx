import { auth } from "@/lib/auth";
import { db, applications, applicantMaster } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { ApplicationFormData } from "@/lib/form-types";
import { VISA_CATEGORY_PART2 } from "@/lib/form-types";
import { PrintTrigger } from "../print-trigger";

// ─── 質問定義 ────────────────────────────────────────────────────────────────
interface Question {
  key: keyof ApplicationFormData;
  section: string;
  label: string;
  note?: string;
  // どの申請書種別・在留資格カテゴリで表示するか（省略すると全て）
  formTypes?: string[];
  categories?: string[];
  // 有・無などの選択肢
  options?: string[];
}

const ALL_QUESTIONS: Question[] = [
  // ── 基本情報 ──────────────────────────────────────────────────────────────
  { key: "nationality",    section: "基本情報", label: "1. 国籍・地域", note: "例：中国、ベトナム" },
  { key: "dateOfBirth",    section: "基本情報", label: "2. 生年月日", note: "例：1990年3月15日" },
  { key: "familyNameEn",   section: "基本情報", label: "3. 氏名（ローマ字・姓 / Family Name）", note: "例：YAMADA" },
  { key: "givenNameEn",    section: "基本情報", label: "3. 氏名（ローマ字・名 / Given Name）", note: "例：TARO" },
  { key: "familyNameJa",   section: "基本情報", label: "3. 氏名（漢字・姓）", note: "漢字氏名がある場合" },
  { key: "givenNameJa",    section: "基本情報", label: "3. 氏名（漢字・名）", note: "漢字氏名がある場合" },
  { key: "sex",            section: "基本情報", label: "4. 性別", options: ["男（Male）", "女（Female）"] },
  { key: "placeOfBirth",   section: "基本情報", label: "5. 出生地", note: "例：北京市", formTypes: ["coe", "change"] },
  { key: "maritalStatus",  section: "基本情報", label: "5（更新）/ 6. 配偶者の有無", options: ["有（Married）", "無（Single）"] },
  { key: "occupation",     section: "基本情報", label: "6（更新）/ 7. 職業", note: "例：会社員、主婦" },
  { key: "homeTownCity",   section: "基本情報", label: "7（更新）/ 8. 本国における居住地", note: "例：上海市徐匯区〇〇路1-2-3" },

  // ── 日本における連絡先 ────────────────────────────────────────────────────
  { key: "postalCodeInJapan",   section: "日本における連絡先", label: "郵便番号", note: "例：160-0023（7桁）" },
  { key: "prefectureInJapan",   section: "日本における連絡先", label: "都道府県", note: "例：東京都" },
  { key: "cityInJapan",         section: "日本における連絡先", label: "市区町村", note: "例：新宿区西新宿" },
  { key: "addressLineInJapan",  section: "日本における連絡先", label: "番地・建物名・部屋番号", note: "例：2-8-1 〇〇マンション 305号室" },
  { key: "telephoneNo",         section: "日本における連絡先", label: "電話番号（固定）", note: "例：03-1234-5678" },
  { key: "cellularPhoneNo",     section: "日本における連絡先", label: "携帯電話番号", note: "例：090-1234-5678" },

  // ── 旅券 ──────────────────────────────────────────────────────────────────
  { key: "passportNumber", section: "旅券（パスポート）", label: "旅券番号", note: "例：AB1234567（英数字）" },
  { key: "passportExpiry", section: "旅券（パスポート）", label: "旅券有効期限", note: "例：2028年12月31日" },

  // ── 在留状況 ─────────────────────────────────────────────────────────────
  { key: "currentStatusOfResidence", section: "現在の在留状況", label: "現在の在留資格", note: "例：家族滞在、技術・人文知識・国際業務" },
  { key: "currentPeriodOfStay",      section: "現在の在留状況", label: "在留期間", note: "例：1年、3年" },
  { key: "currentPeriodExpiry",      section: "現在の在留状況", label: "在留期間の満了日", note: "例：2025年10月15日" },
  { key: "residenceCardNumber",      section: "現在の在留状況", label: "在留カード番号", note: "例：AB12345678CD（英数字12桁）" },

  // ── 更新・変更申請固有 ──────────────────────────────────────────────────
  { key: "desiredStatusOfResidence", section: "申請内容", label: "希望する在留資格（変更の場合）", formTypes: ["change"] },
  { key: "desiredPeriodOfStay",      section: "申請内容", label: "希望する在留期間", note: "例：3年", formTypes: ["change", "extension"] },
  { key: "reasonForApplication",     section: "申請内容", label: "更新・変更の理由", note: "なぜ更新・変更が必要か、具体的にご記入ください" },

  // ── 犯罪記録 ─────────────────────────────────────────────────────────────
  { key: "criminalRecord", section: "犯罪・退去強制歴", label: "犯罪を理由とする処分を受けたことの有無", note: "日本国外・交通違反等を含む", options: ["有（Yes）", "無（No）"] },

  // ── R型: 婚姻・届出 ──────────────────────────────────────────────────────
  { key: "marriageNotificationPlaceJapan",   section: "婚姻・出生届出（R型）", label: "日本国届出先", note: "例：東京都新宿区役所", categories: ["R"] },
  { key: "marriageNotificationDateJapan",    section: "婚姻・出生届出（R型）", label: "日本国届出年月日", note: "例：2020年5月1日", categories: ["R"] },
  { key: "marriageNotificationPlaceForeign", section: "婚姻・出生届出（R型）", label: "本国等届出先", note: "例：中国民政局", categories: ["R"] },
  { key: "marriageNotificationDateForeign",  section: "婚姻・出生届出（R型）", label: "本国等届出年月日", categories: ["R"] },

  // ── R型: 扶養者 ──────────────────────────────────────────────────────────
  { key: "supporterFamilyNameEn", section: "扶養者の情報（R型）", label: "扶養者 氏名（ローマ字・姓）", categories: ["R"] },
  { key: "supporterGivenNameEn",  section: "扶養者の情報（R型）", label: "扶養者 氏名（ローマ字・名）", categories: ["R"] },
  { key: "supporterFamilyNameJa", section: "扶養者の情報（R型）", label: "扶養者 氏名（漢字・姓）", categories: ["R"] },
  { key: "supporterGivenNameJa",  section: "扶養者の情報（R型）", label: "扶養者 氏名（漢字・名）", categories: ["R"] },
  { key: "supporterDob",          section: "扶養者の情報（R型）", label: "扶養者 生年月日", categories: ["R"] },
  { key: "supporterNationality",  section: "扶養者の情報（R型）", label: "扶養者 国籍・地域", categories: ["R"] },
  { key: "supporterResidenceCard", section: "扶養者の情報（R型）", label: "扶養者 在留カード番号", note: "日本国籍の場合は不要", categories: ["R"] },
  { key: "supporterStatusOfResidence", section: "扶養者の情報（R型）", label: "扶養者 在留資格", categories: ["R"] },
  { key: "supporterPeriodOfStay", section: "扶養者の情報（R型）", label: "扶養者 在留期間", note: "例：3年", categories: ["R"] },
  { key: "supporterPeriodExpiry", section: "扶養者の情報（R型）", label: "扶養者 在留期間の満了日", categories: ["R"] },
  { key: "supporterRelationship", section: "扶養者の情報（R型）", label: "申請人との関係（続柄）", options: ["夫", "妻", "父", "母", "養父", "養母", "その他"], categories: ["R"] },
  { key: "supporterEmployer",     section: "扶養者の情報（R型）", label: "扶養者 勤務先名称", categories: ["R"] },
  { key: "supporterCorporateNumber", section: "扶養者の情報（R型）", label: "扶養者 法人番号（13桁）", categories: ["R"] },
  { key: "supporterBranchName",   section: "扶養者の情報（R型）", label: "扶養者 支店・事業所名", categories: ["R"] },
  { key: "supporterAddress",      section: "扶養者の情報（R型）", label: "扶養者 勤務先所在地", categories: ["R"] },
  { key: "supporterAnnualIncome", section: "扶養者の情報（R型）", label: "扶養者 年収（円）", note: "例：5,000,000", categories: ["R"] },

  // ── N型: 勤務先 ──────────────────────────────────────────────────────────
  { key: "employerName",    section: "勤務先（N型）", label: "勤務先名称", categories: ["N", "L", "I", "V"] },
  { key: "employerBranchName", section: "勤務先（N型）", label: "支店・事業所名", categories: ["N", "L", "I", "V"] },
  { key: "employerAddress", section: "勤務先（N型）", label: "勤務先所在地", categories: ["N", "L", "I", "V"] },
  { key: "employerPhone",   section: "勤務先（N型）", label: "勤務先電話番号", categories: ["N", "L", "I", "V"] },
  { key: "salary",          section: "勤務先（N型）", label: "給与・報酬（税引き前・月額または年額）", note: "例：300,000円（月額）", categories: ["N", "L", "I", "V"] },

  // ── T型: 配偶者 ──────────────────────────────────────────────────────────
  { key: "spouseFamilyNameEn", section: "配偶者・身元保証人の情報（T型）", label: "配偶者 氏名（ローマ字・姓）", categories: ["T"] },
  { key: "spouseGivenNameEn",  section: "配偶者・身元保証人の情報（T型）", label: "配偶者 氏名（ローマ字・名）", categories: ["T"] },
  { key: "spouseDob",          section: "配偶者・身元保証人の情報（T型）", label: "配偶者 生年月日", categories: ["T"] },
  { key: "marriageDate",       section: "配偶者・身元保証人の情報（T型）", label: "婚姻（届出）年月日", categories: ["T"] },
  { key: "marriageRegistrationPlace", section: "配偶者・身元保証人の情報（T型）", label: "婚姻届出市区町村名", categories: ["T"] },

  // ── P型: 学校 ────────────────────────────────────────────────────────────
  { key: "schoolName",       section: "在籍学校（P型）", label: "学校名", categories: ["P"] },
  { key: "schoolType",       section: "在籍学校（P型）", label: "学校の種別", options: ["大学院", "大学", "短期大学", "専門学校", "高等学校", "日本語学校", "その他"], categories: ["P"] },
  { key: "enrollmentDate",   section: "在籍学校（P型）", label: "入学年月日", categories: ["P"] },
  { key: "annualTuition",    section: "在籍学校（P型）", label: "年間学費（円）", categories: ["P"] },
  { key: "fundingSource",    section: "在籍学校（P型）", label: "費用支弁方法", categories: ["P"] },
];

// ─── 空欄チェック ─────────────────────────────────────────────────────────────
function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined || v === "") return true;
  if (Array.isArray(v) && v.length === 0) return true;
  return false;
}

export default async function QuestionnairePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const tenantId = (session?.user as any)?.tenantId;
  if (!tenantId) notFound();

  const [app] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.id, id), eq(applications.tenantId, tenantId)))
    .limit(1);
  if (!app) notFound();

  const [applicant] = await db
    .select()
    .from(applicantMaster)
    .where(eq(applicantMaster.id, app.applicantId))
    .limit(1);

  const form = (app.formData ?? {}) as Partial<ApplicationFormData>;

  // 申請書種別
  const toFormType = (t: string) => {
    if (t === "coe" || t === "certification") return "coe";
    if (t === "change") return "change";
    if (t === "extension" || t === "renewal") return "extension";
    return "extension";
  };
  const formType = toFormType(form.applicationFormType ?? app.applicationType);
  const cat = (form.visaFormCategory ?? "N") as string;

  // 空欄の質問だけ抽出（申請書種別・在留資格カテゴリでフィルタリング）
  const emptyQuestions = ALL_QUESTIONS.filter((q) => {
    // 種別フィルタ
    if (q.formTypes && !q.formTypes.includes(formType)) return false;
    // カテゴリフィルタ
    if (q.categories && !q.categories.includes(cat)) return false;
    // 空欄チェック
    return isEmpty(form[q.key]);
  });

  // セクション別にグループ化
  const sections = emptyQuestions.reduce<Record<string, Question[]>>((acc, q) => {
    if (!acc[q.section]) acc[q.section] = [];
    acc[q.section].push(q);
    return acc;
  }, {});

  const today = new Date().toLocaleDateString("ja-JP", {
    year: "numeric", month: "long", day: "numeric",
  });

  const applicantName = [applicant?.familyNameEn, applicant?.givenNameEn]
    .filter(Boolean).join(" ") || "（氏名不明）";

  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <title>顧客確認質問書 — {applicantName}</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: "MS Gothic", "Hiragino Kaku Gothic ProN", sans-serif; font-size: 11px; color: #111; background: #f3f4f6; }
          .page { background: #fff; max-width: 210mm; margin: 0 auto; padding: 14mm 16mm; min-height: 297mm; }
          @media screen { .page { margin: 20px auto; box-shadow: 0 4px 24px rgba(0,0,0,.12); border-radius: 4px; } }
          @media print { body { background: #fff; } .page { padding: 10mm 12mm; max-width: 100%; } .no-print { display: none !important; } }

          h1 { font-size: 16px; font-weight: bold; text-align: center; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 4px; }
          .meta { font-size: 10px; color: #555; text-align: center; margin-bottom: 12px; }
          .instruction { background: #fff9e6; border: 1px solid #f0c040; border-radius: 4px; padding: 8px 12px; font-size: 10px; margin-bottom: 14px; line-height: 1.7; }

          .section-header { background: #1e3a5f; color: #fff; font-weight: bold; font-size: 11px; padding: 4px 8px; margin: 14px 0 4px; }
          .question-block { border: 1px solid #ccc; border-radius: 3px; margin-bottom: 6px; page-break-inside: avoid; }
          .question-label { background: #f0f4fa; font-weight: bold; font-size: 10.5px; padding: 4px 8px; border-bottom: 1px solid #ddd; }
          .question-note { font-size: 9px; color: #777; font-weight: normal; margin-left: 6px; }
          .answer-options { padding: 5px 8px; font-size: 10px; display: flex; flex-wrap: wrap; gap: 16px; }
          .answer-option { display: flex; align-items: center; gap: 4px; }
          .answer-line { height: 28px; border-bottom: 1px solid #aaa; margin: 5px 8px 6px; }

          .no-questions { text-align: center; padding: 30px; color: #666; font-size: 13px; border: 1px dashed #ccc; margin: 20px 0; }
          .footer { margin-top: 20px; padding-top: 8px; border-top: 1px solid #bbb; font-size: 9px; color: #888; display: flex; justify-content: space-between; }

          .sign-area { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 20px; }
          .sign-box { border: 1px solid #999; padding: 6px 8px; height: 50px; }
          .sign-box-label { font-size: 9px; color: #666; margin-bottom: 4px; }
        `}</style>
      </head>
      <body>
        <PrintTrigger applicationId={id} />
        <div className="page">
          <h1>在留申請　ご確認・ご記入のお願い</h1>
          <p className="meta">
            申請人：{applicantName}　|　案件番号：{app.caseNumber}　|　作成日：{today}
          </p>

          <div className="instruction">
            <strong>【お客様へ】</strong><br />
            下記の項目について、行政書士が申請書を作成するために必要な情報が不足しています。<br />
            各質問に対してご回答をご記入のうえ、担当行政書士までご返送ください。<br />
            ご不明な点がございましたら、担当者（090-2596-0128）までお問い合わせください。<br />
            <span style={{ color: "#c00", fontWeight: "bold" }}>
              ※ 記入漏れがある場合、申請書の提出が遅れる場合がございます。
            </span>
          </div>

          {Object.keys(sections).length === 0 ? (
            <div className="no-questions">
              ✅ 現時点で不足している情報はありません。<br />
              <span style={{ fontSize: "10px", color: "#888" }}>申請書の全フィールドに情報が入力されています。</span>
            </div>
          ) : (
            Object.entries(sections).map(([section, questions]) => (
              <div key={section}>
                <div className="section-header">{section}</div>
                {questions.map((q) => (
                  <div key={q.key} className="question-block">
                    <div className="question-label">
                      {q.label}
                      {q.note && <span className="question-note">（{q.note}）</span>}
                    </div>
                    {q.options ? (
                      <div className="answer-options">
                        {q.options.map((opt) => (
                          <div key={opt} className="answer-option">
                            <span style={{ fontSize: "12px", border: "1px solid #999", width: "14px", height: "14px", display: "inline-block", flexShrink: 0 }} />
                            <span>{opt}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="answer-line" />
                    )}
                  </div>
                ))}
              </div>
            ))
          )}

          {/* 署名欄 */}
          <div className="sign-area" style={{ marginTop: "24px" }}>
            <div>
              <div style={{ fontSize: "10px", color: "#666", marginBottom: "4px" }}>お客様署名・確認日</div>
              <div style={{ border: "1px solid #999", height: "48px", padding: "4px 8px" }} />
            </div>
            <div>
              <div style={{ fontSize: "10px", color: "#666", marginBottom: "4px" }}>担当者確認欄（行政書士記入）</div>
              <div style={{ border: "1px solid #999", height: "48px", padding: "4px 8px" }} />
            </div>
          </div>

          <div className="footer">
            <span>行政書士法人 JLS　山口忠士　（yamaguchi@jls-gyosei.jp / 090-2596-0128）</span>
            <span>出力日：{today}　|　案件番号：{app.caseNumber}</span>
          </div>
        </div>
      </body>
    </html>
  );
}

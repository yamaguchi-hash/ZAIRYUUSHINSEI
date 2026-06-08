import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, applications, applicantMaster } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import type { ApplicationFormData } from "@/lib/form-types";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, BorderStyle, Table, TableRow, TableCell,
  WidthType, ShadingType, PageOrientation,
} from "docx";

// ─── 質問定義（print/questionnaire/page.tsx と同一）────────────────────────────
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
  { key: "reasonForApplication",     section: "申請内容", label: "更新・変更の理由", note: "なぜ更新・変更が必要か、具体的にご記入ください" },

  { key: "criminalRecord", section: "犯罪・退去強制歴", label: "犯罪を理由とする処分を受けたことの有無", note: "日本国外・交通違反等を含む", options: ["有", "無"] },

  { key: "marriageNotificationPlaceJapan",   section: "婚姻・出生届出（R型）", label: "日本国届出先", note: "例：東京都新宿区役所", categories: ["R"] },
  { key: "marriageNotificationDateJapan",    section: "婚姻・出生届出（R型）", label: "日本国届出年月日", note: "例：2020年5月1日", categories: ["R"] },
  { key: "marriageNotificationPlaceForeign", section: "婚姻・出生届出（R型）", label: "本国等届出先", note: "例：中国民政局", categories: ["R"] },
  { key: "marriageNotificationDateForeign",  section: "婚姻・出生届出（R型）", label: "本国等届出年月日", categories: ["R"] },

  { key: "supporterNameEn", section: "扶養者の情報（R型）", label: "扶養者 氏名（ローマ字）", note: "例：YAMADA Taro", categories: ["R"] },
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

  { key: "employerName",    section: "勤務先（N型）", label: "勤務先名称", categories: ["N", "L", "I", "V"] },
  { key: "employerBranchName", section: "勤務先（N型）", label: "支店・事業所名", categories: ["N", "L", "I", "V"] },
  { key: "employerAddress", section: "勤務先（N型）", label: "勤務先所在地", categories: ["N", "L", "I", "V"] },
  { key: "employerPhone",   section: "勤務先（N型）", label: "勤務先電話番号", categories: ["N", "L", "I", "V"] },
  { key: "salary",          section: "勤務先（N型）", label: "給与・報酬（税引き前・月額または年額）", note: "例：300,000円（月額）", categories: ["N", "L", "I", "V"] },

  { key: "spouseFamilyNameEn", section: "配偶者・身元保証人の情報（T型）", label: "配偶者 氏名（ローマ字・姓）", categories: ["T"] },
  { key: "spouseGivenNameEn",  section: "配偶者・身元保証人の情報（T型）", label: "配偶者 氏名（ローマ字・名）", categories: ["T"] },
  { key: "spouseDob",          section: "配偶者・身元保証人の情報（T型）", label: "配偶者 生年月日", categories: ["T"] },
  { key: "marriageDate",       section: "配偶者・身元保証人の情報（T型）", label: "婚姻（届出）年月日", categories: ["T"] },
  { key: "marriageRegistrationPlace", section: "配偶者・身元保証人の情報（T型）", label: "婚姻届出市区町村名", categories: ["T"] },

  { key: "schoolName",       section: "在籍学校（P型）", label: "学校名", categories: ["P"] },
  { key: "schoolType",       section: "在籍学校（P型）", label: "学校の種別", options: ["大学院", "大学", "短期大学", "専門学校", "高等学校", "日本語学校", "その他"], categories: ["P"] },
  { key: "enrollmentDate",   section: "在籍学校（P型）", label: "入学年月日", categories: ["P"] },
  { key: "annualTuition",    section: "在籍学校（P型）", label: "年間学費（円）", categories: ["P"] },
  { key: "fundingSource",    section: "在籍学校（P型）", label: "費用支弁方法", categories: ["P"] },
];

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined || v === "") return true;
  if (Array.isArray(v) && v.length === 0) return true;
  return false;
}

// ─── ドキュメント構築ヘルパー ─────────────────────────────────────────────────

function sectionHeader(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        bold: true,
        color: "FFFFFF",
        font: "MS Gothic",
        size: 22,
      }),
    ],
    heading: HeadingLevel.HEADING_2,
    shading: { type: ShadingType.SOLID, color: "1E3A5F" },
    spacing: { before: 200, after: 80 },
    indent: { left: 120 },
  });
}

function questionBlock(q: Question): Table {
  // ラベル行
  const labelChildren = [
    new TextRun({ text: q.label, bold: true, font: "MS Gothic", size: 20 }),
  ];
  if (q.note) {
    labelChildren.push(new TextRun({ text: `　（${q.note}）`, color: "888888", font: "MS Gothic", size: 18 }));
  }

  // 回答行
  let answerContent: Paragraph;
  if (q.options && q.options.length > 0) {
    // ☐ 選択肢を横並び
    const runs: TextRun[] = [];
    q.options.forEach((opt, i) => {
      if (i > 0) runs.push(new TextRun({ text: "　　", font: "MS Gothic", size: 22 }));
      runs.push(new TextRun({ text: "☐ ", font: "MS Gothic", size: 24, color: "555555" }));
      runs.push(new TextRun({ text: opt, font: "MS Gothic", size: 22 }));
    });
    answerContent = new Paragraph({
      children: runs,
      spacing: { before: 60, after: 60 },
      indent: { left: 120 },
    });
  } else {
    // 回答記入欄（下線）
    answerContent = new Paragraph({
      children: [
        new TextRun({
          text: "　".repeat(50),
          underline: { type: "single", color: "AAAAAA" },
          font: "MS Gothic",
          size: 22,
        }),
      ],
      spacing: { before: 80, after: 80 },
      indent: { left: 120 },
    });
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    margins: { top: 40, bottom: 40, left: 120, right: 120 },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { type: ShadingType.SOLID, color: "EEF2FA" },
            children: [
              new Paragraph({
                children: labelChildren,
                spacing: { before: 60, after: 60 },
                indent: { left: 80 },
              }),
            ],
            borders: {
              top:    { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
              left:   { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
              right:  { style: BorderStyle.NONE,   size: 0, color: "FFFFFF" },
            },
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            children: [answerContent],
            borders: {
              top:    { style: BorderStyle.NONE,   size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
              left:   { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
              right:  { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
            },
          }),
        ],
      }),
    ],
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

  const form = (app.formData ?? {}) as Partial<ApplicationFormData>;

  const toFormType = (t: string) => {
    if (t === "coe" || t === "certification") return "coe";
    if (t === "change") return "change";
    if (t === "extension" || t === "renewal") return "extension";
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

  const today = new Date().toLocaleDateString("ja-JP", {
    year: "numeric", month: "long", day: "numeric",
  });
  const applicantName = [applicant?.familyNameEn, applicant?.givenNameEn]
    .filter(Boolean).join(" ") || "（氏名不明）";

  // ── ドキュメント構築 ─────────────────────────────────────────────────────
  const children: (Paragraph | Table)[] = [];

  // タイトル
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "在留申請　ご確認・ご記入のお願い",
          bold: true,
          font: "MS Gothic",
          size: 32,
        }),
      ],
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    })
  );

  // メタ情報
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: `申請人：${applicantName}　|　案件番号：${app.caseNumber}　|　作成日：${today}`, font: "MS Gothic", size: 18, color: "555555" }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    })
  );

  // お願い文
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: "【お客様へ】", bold: true, font: "MS Gothic", size: 20 }),
      ],
      spacing: { before: 100, after: 40 },
      indent: { left: 200 },
      shading: { type: ShadingType.SOLID, color: "FFF9E6" },
      border: {
        top:    { style: BorderStyle.SINGLE, size: 4, color: "F0C040", space: 1 },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: "F0C040", space: 1 },
        left:   { style: BorderStyle.SINGLE, size: 8, color: "F0A000", space: 1 },
        right:  { style: BorderStyle.SINGLE, size: 4, color: "F0C040", space: 1 },
      },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "下記の項目について、行政書士が申請書を作成するために必要な情報が不足しています。", font: "MS Gothic", size: 20 }),
      ],
      spacing: { after: 40 },
      indent: { left: 200 },
      shading: { type: ShadingType.SOLID, color: "FFF9E6" },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "各質問に対してご回答をご記入のうえ、担当行政書士までご返送ください。", font: "MS Gothic", size: 20 }),
      ],
      spacing: { after: 40 },
      indent: { left: 200 },
      shading: { type: ShadingType.SOLID, color: "FFF9E6" },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "ご不明な点は担当者（090-2596-0128）までお問い合わせください。", font: "MS Gothic", size: 20 }),
      ],
      spacing: { after: 40 },
      indent: { left: 200 },
      shading: { type: ShadingType.SOLID, color: "FFF9E6" },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "※ 記入漏れがある場合、申請書の提出が遅れる場合がございます。", bold: true, color: "CC0000", font: "MS Gothic", size: 20 }),
      ],
      spacing: { after: 100 },
      indent: { left: 200 },
      shading: { type: ShadingType.SOLID, color: "FFF9E6" },
      border: {
        top:    { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: "F0C040", space: 1 },
        left:   { style: BorderStyle.SINGLE, size: 8, color: "F0A000", space: 1 },
        right:  { style: BorderStyle.SINGLE, size: 4, color: "F0C040", space: 1 },
      },
    })
  );

  if (Object.keys(sections).length === 0) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: "✅ 現時点で不足している情報はありません。申請書の全フィールドに情報が入力されています。", font: "MS Gothic", size: 22, color: "006600" }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { before: 400, after: 400 },
      })
    );
  } else {
    for (const [section, questions] of Object.entries(sections)) {
      children.push(sectionHeader(section));
      children.push(new Paragraph({ spacing: { after: 60 } })); // spacer
      for (const q of questions) {
        children.push(questionBlock(q));
      }
    }
  }

  // 署名欄
  children.push(
    new Paragraph({ spacing: { before: 300, after: 100 } }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({ children: [new TextRun({ text: "お客様署名・確認日", font: "MS Gothic", size: 18, color: "666666" })], spacing: { after: 20 } }),
                new Paragraph({ children: [new TextRun({ text: "　" })], spacing: { before: 200, after: 200 } }),
              ],
              borders: {
                top:    { style: BorderStyle.SINGLE, size: 4, color: "999999" },
                bottom: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
                left:   { style: BorderStyle.SINGLE, size: 4, color: "999999" },
                right:  { style: BorderStyle.SINGLE, size: 4, color: "999999" },
              },
              margins: { top: 80, left: 120 },
            }),
            new TableCell({
              children: [
                new Paragraph({ children: [new TextRun({ text: "担当者確認欄（行政書士記入）", font: "MS Gothic", size: 18, color: "666666" })], spacing: { after: 20 } }),
                new Paragraph({ children: [new TextRun({ text: "　" })], spacing: { before: 200, after: 200 } }),
              ],
              borders: {
                top:    { style: BorderStyle.SINGLE, size: 4, color: "999999" },
                bottom: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
                left:   { style: BorderStyle.SINGLE, size: 4, color: "999999" },
                right:  { style: BorderStyle.SINGLE, size: 4, color: "999999" },
              },
              margins: { top: 80, left: 120 },
            }),
          ],
        }),
      ],
    }),
    new Paragraph({ spacing: { before: 200 } }),
    new Paragraph({
      children: [
        new TextRun({ text: `行政書士法人 JLS　山口忠士　（yamaguchi@jls-gyosei.jp / 090-2596-0128）　|　出力日：${today}　|　案件番号：${app.caseNumber}`, font: "MS Gothic", size: 16, color: "888888" }),
      ],
      alignment: AlignmentType.CENTER,
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: "BBBBBB" } },
    })
  );

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: "MS Gothic", size: 22 },
        },
      },
    },
    sections: [{
      properties: {},
      children,
    }],
  });

  const buf = await Packer.toBuffer(doc);
  const uint8 = new Uint8Array(buf);
  const fileName = `${app.caseNumber ?? id}_${applicantName}_質問書.docx`;

  return new NextResponse(uint8, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}

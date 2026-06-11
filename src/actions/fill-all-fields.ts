"use server";

import { auth } from "@/lib/auth";
import {
  db, applications, applicationDocumentChecklist, applicationAttachments,
  applicantMaster, organizationMaster,
} from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { VISA_TYPE_LABELS } from "@/lib/utils";
import { EMPTY_FORM_DATA } from "@/lib/form-types";
import { cleanseMasterCodes } from "@/lib/master-cleansing";
import { normalizeFamilyMembers, mergeFamilyMembers } from "@/lib/family-schema";
import { STAGE1_RESPONSE_SCHEMA, STAGE2_RESPONSE_SCHEMA, schemaToFieldList } from "@/lib/shinsei-ai-schemas";
import { mapWithConcurrency } from "@/lib/concurrency";

// プロンプト用フィールド定義リスト（モジュールロード時に1回だけ生成）
const STAGE1_FIELD_LIST = schemaToFieldList(STAGE1_RESPONSE_SCHEMA);
const STAGE2_FIELD_LIST = schemaToFieldList(STAGE2_RESPONSE_SCHEMA);

// ═════════════════════════════════════════════════════════════════════════════
// ポスト処理バリデーション — ハルシネーション防止
// ═════════════════════════════════════════════════════════════════════════════

/** 日付フィールド（YYYY-MM-DD 形式のみ許可） */
const DATE_FIELDS = new Set([
  'dateOfBirth','passportExpiry','currentPeriodExpiry','scheduledDateOfEntry',
  'pastEntryLatestFrom','pastEntryLatestTo','deportationLatestDate',
  'orgContractStartDate','orgContractEndDate',
  'orgVDispatchStartDate','orgVDispatchEndDate',
  'orgPlacementProviderLicenseDate',
  'marriageDate','marriageRegistrationDate',
  'marriageNotificationDateJapan','marriageNotificationDateForeign',
  'educationGraduationDate','enrollmentDate','expectedGraduationDate',
  'employmentStartDate',
  'spouseDob','supporterDob','supporterPeriodExpiry',
  'rsoRegDate',
  'orgCoexistenceWorkplaceCityDate','orgCoexistenceResidenceCityDate',
]);

/** 有無フィールド（「有」「無」のみ許可） */
const YESNO_FIELDS = new Set([
  'maritalStatus','criminalRecord','familyInJapanExists',
  'pastEntryHistory','pastCoeHistory','deportationHistory',
  'accompanyingPersons','itQualificationExists',
  'partTimeWorkExistsR','partTimeWorkPermit','cohabitation',
  'depositContractExists','overseasExpensesExists',
  'homeCountryProcedureComplied','regularExpensesUnderstood',
  'technologyTransferEffortV','ssfSpecificFieldCriteriaMet',
  'orgWorkHoursEquivalent','orgSalaryEqualToJapanese',
  'orgSalaryPaymentCash','orgSalaryPaymentBank',
  'orgForeignTreatmentDifference','orgPaidHolidayForReturn',
  'orgFieldSpecificEmploymentCriteria','orgReturnTravelExpenses',
  'orgHealthCheck','orgProperResidenceCriteria',
  'orgHealthInsuranceMet','orgLaborInsuranceMet',
  'orgLaborLawViolation','orgInvoluntaryDismissal','orgMissingPerson',
  'orgCriminalPunishment','orgMentalDisability','orgBankruptcy',
  'orgTrainingRevoked','orgWasOfficerOfRevoked','orgIllegalActFiveYears',
  'orgGangsterMember','orgLegalAgentViolation',
  'orgGangsterControl','orgActivityDocumentKept',
  'orgAwareOfDeposit','orgPenaltyContractExists',
  'orgSupportCostNotBurdened',
  'orgDispatchMeetsCondition','orgDispatchMeetsCompliance',
  'orgAccidentInsurance','orgContinuousPerformance',
  'orgSalaryPaymentVerifiable','orgCoexistenceCooperation',
  'orgCoexistenceWorkplaceCity','orgCoexistenceResidenceCity',
  'orgFieldSpecificContractCriteria',
]);

/** 数値のみフィールド（数字以外を除去） */
const NUMERIC_FIELDS = new Set([
  'salary','orgCapital','orgAnnualSales','orgEmployeeCount',
  'orgForeignEmployeeCount','orgTechInternCount',
  'orgTimeConvertedBasicSalary','orgJapaneseEquivalentSalary',
  'orgWorkHoursWeekly','orgWorkHoursMonthly',
  'annualTuition','fundingAmount','scholarshipAmount',
  'supporterAnnualIncome','businessExperienceYears',
  'pastEntryCount','pastCoeCount','pastCoeNonIssuanceCount',
  'deportationCount','cumulativeStayYears','cumulativeStayMonths',
  'overseasExpensesAmount','rsoFeePerMonth',
  'partTimeWorkSalaryR','gaikatsuSalary',
  'dispatchOrgCapital','dispatchOrgAnnualSales',
]);

/** AI出力のバリデーション・クリーニング */
function validateAndClean(data: Record<string, any>): Record<string, any> {
  for (const k of Object.keys(data)) {
    const v = data[k];
    if (v === null || v === undefined) { data[k] = ''; continue; }
    if (typeof v !== 'string') continue;

    if (DATE_FIELDS.has(k)) {
      if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) data[k] = '';
    }
    if (YESNO_FIELDS.has(k)) {
      if (v && !['有','無'].includes(v)) data[k] = '';
    }
    if (NUMERIC_FIELDS.has(k)) {
      if (v) data[k] = v.replace(/[^0-9]/g, '');
    }
  }
  return data;
}

// ═════════════════════════════════════════════════════════════════════════════
// マスター確定値・AI非対象のフィールドキー
// ═════════════════════════════════════════════════════════════════════════════
const MASTER_OVERRIDE_KEYS = new Set([
  'applicationFormType','visaFormCategory','lastUpdated',
  'agentName','agentAddress','agentOrganization','agentPhone',
  'nationality','dateOfBirth','familyNameEn','givenNameEn',
  'familyNameJa','givenNameJa','sex',
  'postalCodeInJapan','prefectureInJapan','cityInJapan',
  'addressLineInJapan','addressInJapan','telephoneNo','cellularPhoneNo',
  'passportNumber','passportExpiry',
  'currentStatusOfResidence','currentPeriodExpiry','residenceCardNumber',
  'desiredStatusOfResidence',
  'employerName','employerAddress','employerPhone',
  'orgName','orgCorporateNumber','orgAddress','orgPhone',
  'orgCapital','orgEmployeeCount','orgEmploymentInsuranceNo',
]);

/** AI抽出対象外のフィールドキー（ステータス判定で除外） */
const STATUS_EXEMPT_KEYS = new Set([
  'applicationFormType','visaFormCategory','lastUpdated',
  'agentName','agentAddress','agentOrganization','agentPhone',
  'addressInJapan', // 結合値（自動生成）
  'freeformPart2Notes','freeformOrgNotes',
  'riyushoSubmissionBureau','riyushoBody',
  'gaikatsuNeeded',
]);

// ─── MIMEタイプ正規化 ────────────────────────────────────────────────────────
function normalizeMime(m: string): string {
  const lower = m.toLowerCase().trim();
  if (lower === "image/jpg" || lower === "image/pjpeg") return "image/jpeg";
  return lower;
}

// ─── ファイルをbase64で取得 ───────────────────────────────────────────────────
async function fileToBase64(
  fileUrl: string, mimeType: string | null
): Promise<{ base64: string; mime: string } | null> {
  try {
    let base64: string, mime: string;
    if (fileUrl.startsWith("data:")) {
      const ci = fileUrl.indexOf(",");
      base64 = fileUrl.slice(ci + 1);
      mime = normalizeMime(fileUrl.slice(5, ci).split(";")[0]);
    } else {
      const res = await fetch(fileUrl, { cache: "no-store" });
      if (!res.ok) {
        console.error(`[fillAllFields] fetch failed: ${res.status} ${res.statusText} for ${fileUrl.slice(0, 100)}`);
        return null;
      }
      base64 = Buffer.from(await res.arrayBuffer()).toString("base64");
      mime = normalizeMime(mimeType ?? "image/jpeg");
    }
    const ok = ["image/jpeg","image/png","image/webp","image/heic","image/heif","application/pdf"];
    if (!ok.includes(mime)) {
      console.error(`[fillAllFields] unsupported mime: ${mime}`);
      return null;
    }
    return { base64, mime };
  } catch (e: any) {
    console.error(`[fillAllFields] fileToBase64 error: ${e?.message}`);
    return null;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// メインアクション
// ═════════════════════════════════════════════════════════════════════════════
export async function fillAllFieldsFromDocs(
  applicationId: string
): Promise<{
  success: boolean;
  error?: string;
  formData?: Record<string, any>;
  docsRead?: number;
}> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = (session.user as any)?.tenantId as string | undefined;
    if (!tenantId) return { success: false, error: "テナントIDが取得できません" };

    if (!process.env.GEMINI_API_KEY) {
      return { success: false, error: "AI機能が設定されていません（GEMINI_API_KEY未設定）" };
    }

    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // ── 1. 申請案件・申請人・所属機関を取得 ────────────────────────────────────
    const [app] = await db.select().from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId))).limit(1);
    if (!app) return { success: false, error: "申請案件が見つかりません" };

    const [applicant] = await db.select().from(applicantMaster)
      .where(eq(applicantMaster.id, app.applicantId)).limit(1);
    const org = app.organizationId
      ? await db.select().from(organizationMaster)
          .where(eq(organizationMaster.id, app.organizationId)).limit(1).then(r => r[0])
      : null;

    // 申請人氏名（扶養者と区別するため）
    const applicantNameEn = [applicant?.familyNameEn, applicant?.givenNameEn].filter(Boolean).join(" ");
    const applicantNameJa = [applicant?.familyNameJa, applicant?.givenNameJa].filter(Boolean).join(" ");

    // ── 2. 添付書類を取得 ─────────────────────────────────────────────────────
    // 主ソース: application_attachments（入管提出用添付書類パネルからのアップロード）
    // 互換ソース: 旧チェックリストにアップロード済みのファイル
    const attachmentRows = await db.select().from(applicationAttachments)
      .where(eq(applicationAttachments.applicationId, applicationId));
    const checklist = await db.select().from(applicationDocumentChecklist)
      .where(eq(applicationDocumentChecklist.applicationId, applicationId));
    const legacySubmitted = checklist.filter(c => c.fileUrl && c.status === "submitted");

    const submitted: { documentName: string; fileUrl: string; mimeType: string | null }[] = [
      ...attachmentRows.map(a => ({
        documentName: a.documentLabel ?? a.documentType,
        fileUrl: a.fileUrl,
        mimeType: a.mimeType,
      })),
      ...legacySubmitted.map(c => ({
        documentName: c.documentName,
        fileUrl: c.fileUrl!,
        mimeType: c.mimeType,
      })),
    ];

    if (submitted.length === 0) {
      return { success: false, error: "添付書類がありません。「申請書作成用 添付書類」パネルから書類をアップロードしてから実行してください。" };
    }

    // ── 3. 全書類を個別にGeminiで読み取り（Stage 1）────────────────────────────
    // 逐次実行だとVercelの関数タイムアウト（300秒）を超過するため、
    // 複数書類を並行処理してウォールクロック時間を短縮する。
    type DocResult =
      | { ok: true; name: string; data: Record<string, any> }
      | { ok: false; name: string; error: string };

    const STAGE1_CONCURRENCY = 4;

    const docResults: DocResult[] = await mapWithConcurrency(
      submitted.slice(0, 20),
      STAGE1_CONCURRENCY,
      async (doc): Promise<DocResult> => {
      const file = await fileToBase64(doc.fileUrl!, doc.mimeType);
      if (!file) {
        const reason = `ファイル取得失敗 (mime=${doc.mimeType}, url=${doc.fileUrl?.slice(0, 80)}...)`;
        console.error(`[fillAllFields] skip "${doc.documentName}": ${reason}`);
        return { ok: false, name: doc.documentName, error: reason };
      }

      try {
        const ocrPrompt = `【役割】あなたは特定技能の在留申請手続きを専門とする行政書士AIアシスタントです。提出書類から申請書記入に必要な情報を正確に読み取ります。

【処理対象】書類「${doc.documentName}」

【申請人の情報】
申請人氏名: ${applicantNameEn}${applicantNameJa ? `（${applicantNameJa}）` : ""}
※この書類に申請人と別人の情報が混在する場合（扶養者の書類等）、それぞれ区別して抽出してください。
※この書類が申請人以外の親族（在日親族・同居者）の在留カードやメモの場合は、docSubject を「在日親族」とし、その人物の氏名・生年月日・国籍・在留カード番号等を該当フィールドに出力してください。notes に続柄・勤務先・同居の有無など分かる情報を記載してください。

【処理手順】
1. 書類全体を確認し、書類の種類を特定する（パスポート、在留カード、雇用条件書、雇用契約書、登記簿謄本 等）
2. 申請人の情報か、別人（扶養者・配偶者等）の情報かを判別する
3. 下記のフィールド定義に該当する情報を正確に読み取る
4. 日付・数値等のフォーマットを指定形式に変換する

【出力フィールド定義】（このキー名のJSONオブジェクトで出力すること。書類に該当情報があるフィールドのみ値を設定し、それ以外は省略してよい）
${STAGE1_FIELD_LIST}

【データ形式に関する注意】
・入力データがExcelから出力されたCSV形式の場合、大量のカンマ（,,,）、空白セル、改行、日本語と英語の併記が含まれることがあります。
・項目名の前後・周辺にあるデータや、離れたセル位置にある数値も文脈から慎重に紐づけて抽出してください。
・チェックボックス（□ / ☑ / ■ / ✓ や「有・無」の選択）は、文脈からどちらが選択されているか判断し「有」または「無」で出力してください。
・表形式で項目名と値が離れている場合（例：「所定労働時間,,,,40」のような形式）、カンマ区切りの位置関係から値を正確に読み取ってください。

【制約（必ず遵守）】
・JSONオブジェクトのみを出力すること（説明文・マークダウン不可）
・上記フィールド定義にあるキー名のみを使用すること
・書類に明記されている情報のみ抽出し、推測・補完は行わないこと
・該当情報がない場合は ""（空文字列）とするか、キー自体を省略すること
・日付は必ずYYYY-MM-DD形式
・性別は「男」または「女」（M/Fは使用しない）
・有無は「有」または「無」（英語不可）
・数値フィールドは数値のみ（単位・記号・カンマ不可）`;

        // 注意: responseSchema は使用しない（約300フィールドのスキーマは
        // Gemini の状態数上限を超え "too many states" 400エラーになるため、
        // スキーマなしJSONモード＋プロンプト内フィールド定義で出力させる）
        const resp = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{ parts: [
            { inlineData: { mimeType: file.mime, data: file.base64 } },
            { text: ocrPrompt },
          ]}],
          config: {
            responseMimeType: "application/json",
          },
        });

        const txt = resp.text ?? "{}";
        try {
          const data = JSON.parse(txt);
          return { ok: true, name: doc.documentName, data };
        } catch (parseErr: any) {
          console.error(`[fillAllFields] JSON parse error for "${doc.documentName}":`, parseErr?.message, "raw:", txt.slice(0, 500));
          const m = txt.match(/```json?\s*([\s\S]*?)```/) ?? txt.match(/(\{[\s\S]*\})/);
          if (m) {
            try {
              const data = JSON.parse(m[1] ?? m[0]);
              return { ok: true, name: doc.documentName, data };
            } catch (e2: any) {
              console.error(`[fillAllFields] fallback parse also failed for "${doc.documentName}":`, e2?.message);
              return { ok: false, name: doc.documentName, error: "JSONパース失敗" };
            }
          }
          return { ok: false, name: doc.documentName, error: "JSONパース失敗" };
        }
      } catch (geminiErr: any) {
        const msg = geminiErr?.message ?? String(geminiErr);
        console.error(`[fillAllFields] Gemini Stage1 error for "${doc.documentName}":`, msg);
        return { ok: false, name: doc.documentName, error: msg.slice(0, 200) };
      }
      }
    );

    const ocrPerDoc: { name: string; data: Record<string, any> }[] = [];
    let docsRead = 0;
    const docErrors: string[] = [];
    for (const r of docResults) {
      if (r.ok) {
        ocrPerDoc.push({ name: r.name, data: r.data });
        docsRead++;
      } else {
        docErrors.push(`${r.name}: ${r.error}`);
      }
    }

    if (ocrPerDoc.length === 0) {
      const detail = docErrors.length > 0
        ? `\n詳細:\n${docErrors.join("\n")}`
        : "";
      console.error(`[fillAllFields] all docs failed. submitted=${submitted.length}, errors:`, docErrors);
      return { success: false, error: `書類の読み取りに失敗しました。${detail}` };
    }

    // ── 4. 全書類OCR結果を統合サマリーとして構築 ────────────────────────────
    const docSummary = ocrPerDoc.map((d, i) =>
      `【書類${i + 1}: ${d.name}】\n${JSON.stringify(d.data, null, 2)}`
    ).join("\n\n");

    // ── 5. 申請人マスターの確定値をベースに構築 ──────────────────────────────
    const toJaVisa = (v: string | null | undefined) =>
      v ? (VISA_TYPE_LABELS[v] ?? v) : "";

    const masterBase: Record<string, any> = {
      nationality:              applicant?.nationality ?? "",
      dateOfBirth:              applicant?.dateOfBirth ?? "",
      familyNameEn:             applicant?.familyNameEn ?? "",
      givenNameEn:              applicant?.givenNameEn ?? "",
      familyNameJa:             applicant?.familyNameJa ?? "",
      givenNameJa:              applicant?.givenNameJa ?? "",
      sex:                      applicant?.gender === "M" ? "男" : applicant?.gender === "F" ? "女" : "",
      postalCodeInJapan:        (applicant as any)?.postalCode ?? "",
      prefectureInJapan:        (applicant as any)?.japanPrefecture ?? "",
      cityInJapan:              (applicant as any)?.japanCity ?? "",
      addressLineInJapan:       (applicant as any)?.japanAddressLine ?? "",
      addressInJapan:           applicant?.japanAddress ?? "",
      telephoneNo:              applicant?.phone ?? "",
      cellularPhoneNo:          (applicant as any)?.mobilePhone ?? "",
      passportNumber:           applicant?.passportNumber ?? "",
      passportExpiry:           applicant?.passportExpiry ?? "",
      currentStatusOfResidence: toJaVisa(applicant?.currentVisaType),
      currentPeriodExpiry:      applicant?.currentVisaExpiry ?? "",
      residenceCardNumber:      applicant?.residenceCardNumber ?? "",
      desiredStatusOfResidence: VISA_TYPE_LABELS[app.visaType] ?? app.visaType ?? "",
      employerName:    org?.nameJa ?? "",
      employerAddress: [org?.prefecture, org?.city, org?.addressLine].filter(Boolean).join(""),
      employerPhone:   org?.phone ?? "",
      orgName:         org?.nameJa ?? "",
      orgCorporateNumber: org?.corporateNumber ?? "",
      orgAddress:      [org?.prefecture, org?.city, org?.addressLine].filter(Boolean).join(""),
      orgPhone:        org?.phone ?? "",
      orgCapital:      org?.capital ? String(org.capital) : "",
      orgEmployeeCount: org?.employeeCount ? String(org.employeeCount) : "",
      orgEmploymentInsuranceNo: org?.employmentInsuranceNo ?? "",
      agentName:         "山口忠士",
      agentOrganization: "兵庫県行政書士会",
      agentAddress:      "〒665-0864 兵庫県宝塚市泉町22-25 島上マンション南棟1-B",
      agentPhone:        "090-2596-0128",
    };

    // ── 6. 包括的Geminiコール：全フィールドを一括統合（Stage 2）──────────────
    const synthPrompt = `【役割】あなたは在留資格申請を専門とする行政書士AIアシスタントです。複数の提出書類から読み取った情報を統合し、申請書の全フィールドを正確に埋めます。

【処理手順】
1. 全${docsRead}件の書類読取結果を確認する（キー名は出力JSONと同じフォームフィールド名です）
2. 同一フィールドに複数の情報源がある場合、最も公的かつ最新の書類（パスポート・在留カード等）を優先する
3. 申請人の情報と扶養者・配偶者の情報を正確に区別する
4. docSubject が「在日親族」の書類（親族の在留カード・メモ等）の情報は、申請人のフィールドには入れず、familyInJapan 配列に1人1要素で組み立てる（氏名・生年月日・国籍・在留カード番号、notes にあれば続柄・勤務先・同居の有無）。申請人本人は含めない
5. 各フィールドの値を指定されたフォーマットに整形する

━━ 申請人情報（確定値・変更不可） ━━
氏名: ${applicantNameEn}${applicantNameJa ? `（${applicantNameJa}）` : ""}
国籍: ${applicant?.nationality ?? "不明"} / 在留資格: ${applicant?.currentVisaType ?? "不明"}
申請種別: ${app.applicationType} / 申請在留資格: ${app.visaType ?? ""}

━━ 読み取り済み書類（${docsRead}件） ━━
${docSummary}

━━ 所属機関情報 ━━
${org ? `${org.nameJa ?? ""} / 法人番号: ${org.corporateNumber ?? ""} / ${[org.prefecture, org.city, org.addressLine].filter(Boolean).join("")}` : "（なし）"}

上記の書類情報を精査し、下記フィールド定義の全フィールドを埋めてください。

【出力フィールド定義】（このキー名のJSONオブジェクトで出力すること）
${STAGE2_FIELD_LIST}

【データ形式に関する注意】
・入力データがExcelから出力されたCSV形式の場合、大量のカンマ（,,,）、空白セル、改行、日本語と英語の併記が含まれることがあります。
・項目名の前後・周辺にあるデータや、離れたセル位置にある数値も文脈から慎重に紐づけて抽出してください。
・チェックボックス（□ / ☑ / ■ / ✓ や「有・無」の選択）は、文脈からどちらが選択されているか判断し「有」または「無」で出力してください。
・表形式で項目名と値が離れている場合（例：「所定労働時間,,,,40」のような形式）、カンマ区切りの位置関係から値を正確に読み取ってください。

【制約（必ず遵守）】
・JSONオブジェクトのみを出力すること（説明文・マークダウン不可）
・上記フィールド定義にあるキー名のみを使用すること
・書類に明記されている情報を最優先（推測・補完は行わない）
・日付は必ずYYYY-MM-DD形式（例：2025-03-15）
・有無は「有」または「無」のみ（英語不可）
・性別は「男」または「女」のみ（M/F不可）
・数値フィールドは数値のみ（単位・記号・カンマ不可）
・不明・書類に記載なしは ""（空文字列）とするか、キー自体を省略すること`;

    // 注意: responseSchema は使用しない（状態数上限超過のため。STAGE1と同様）
    const synthResp = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ parts: [{ text: synthPrompt }] }],
      config: {
        responseMimeType: "application/json",
      },
    });

    const synthTxt = synthResp.text ?? "{}";
    let aiData: Record<string, any>;
    try {
      aiData = JSON.parse(synthTxt);
    } catch {
      const synthM = synthTxt.match(/```json?\s*([\s\S]*?)```/) ?? synthTxt.match(/(\{[\s\S]*\})/);
      aiData = synthM ? JSON.parse(synthM[1] ?? synthM[0]) : {};
    }

    // ── 6-b. バリデーション・クリーニング ────────────────────────────────────
    aiData = validateAndClean(aiData);

    // ── 6-c. 業種・職種マスタ照合クレンジング ────────────────────────────────
    // ラベル表記ゆれ→コード自動変換、マスタにない不正値→空（画面で手動選択）
    aiData = cleanseMasterCodes(aiData);

    // ── 7. マスターデータ優先でマージ ────────────────────────────────────────
    // EMPTY_FORM_DATA → 既存保存データ → AI抽出 → マスター確定値 の順で上書き
    const existingForm = (app.formData ?? {}) as Record<string, any>;
    const merged: Record<string, any> = { ...EMPTY_FORM_DATA, ...existingForm };

    // AIデータで空フィールドのみ埋める
    for (const [k, v] of Object.entries(aiData)) {
      if (v !== null && v !== undefined && v !== "" && !merged[k]) {
        merged[k] = v;
      }
    }
    // workHistory は配列処理
    if (aiData.workHistory && Array.isArray(aiData.workHistory) && aiData.workHistory.length > 0) {
      const wh = (merged.workHistory ?? []) as any[];
      if (wh.every((w: any) => !w.employer && !w.joinDate)) {
        merged.workHistory = aiData.workHistory;
      }
    }
    // familyInJapan（在日親族）は既存リストとマージ（氏名で重複排除・申請人本人は除外）
    if (aiData.familyInJapan && Array.isArray(aiData.familyInJapan) && aiData.familyInJapan.length > 0) {
      const extracted = normalizeFamilyMembers(aiData.familyInJapan);
      if (extracted.length > 0) {
        merged.familyInJapan = mergeFamilyMembers(
          (merged.familyInJapan ?? []) as any[],
          extracted,
          [applicantNameEn, applicantNameJa],
        );
        if ((merged.familyInJapan as any[]).length > 0) {
          merged.familyInJapanExists = '有';
        }
      }
    }

    // マスター確定値を最後に上書き（変更不可フィールド）
    Object.assign(merged, masterBase);

    // ── 7-b. 家族滞在の場合、扶養者情報を在日親族に自動反映 ─────────────────
    if (app.visaType === 'dependent') {
      const supporterName = merged.supporterNameEn
        || [merged.supporterFamilyNameEn, merged.supporterGivenNameEn].filter(Boolean).join(' ');
      if (supporterName) {
        const familyList = (merged.familyInJapan ?? []) as any[];
        const alreadyExists = familyList.some((m: any) =>
          m.name && supporterName && m.name.replace(/\s/g, '') === supporterName.replace(/\s/g, '')
        );
        if (!alreadyExists) {
          familyList.unshift({
            relationship: merged.supporterRelationship || '',
            name: supporterName,
            dateOfBirth: merged.supporterDob || '',
            nationality: merged.supporterNationality || '',
            placeOfEmployment: merged.supporterEmployer || '',
            residingTogether: true,
            residenceCardNumber: merged.supporterResidenceCard || '',
          });
          merged.familyInJapan = familyList;
          merged.familyInJapanExists = '有';
        }
      }
    }

    // ── 7-c. AIフィールドステータスの生成 ───────────────────────────────────
    const fieldStatus: Record<string, 'confirmed' | 'empty'> = {};
    for (const key of Object.keys(EMPTY_FORM_DATA)) {
      if (STATUS_EXEMPT_KEYS.has(key)) continue;
      if (MASTER_OVERRIDE_KEYS.has(key)) continue;
      // 配列型は個別判定
      if (key === 'workHistory' || key === 'familyInJapan' || key === 'orgOccupationNumberAdditional') continue;

      const val = merged[key];
      if (val && val !== '' && val !== '無' && val !== '有') {
        // 実質的な値がある → confirmed
        fieldStatus[key] = 'confirmed';
      } else if (YESNO_FIELDS.has(key) && (val === '有' || val === '無')) {
        // 有無フィールドでデフォルト値と異なるか、AIが設定した → confirmed
        const defaultVal = (EMPTY_FORM_DATA as any)[key];
        if (aiData[key] && aiData[key] !== '') {
          fieldStatus[key] = 'confirmed';
        } else if (val !== defaultVal) {
          fieldStatus[key] = 'confirmed';
        } else {
          fieldStatus[key] = 'empty';
        }
      } else {
        fieldStatus[key] = 'empty';
      }
    }
    merged.aiFieldStatus = fieldStatus;

    // ── 8. DBに保存 ───────────────────────────────────────────────────────────
    await db.update(applications)
      .set({ formData: merged, updatedAt: new Date() })
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)));

    return { success: true, formData: merged, docsRead };
  } catch (err: any) {
    console.error("[fillAllFields] error:", err?.message);
    return { success: false, error: err.message ?? "処理中にエラーが発生しました" };
  }
}

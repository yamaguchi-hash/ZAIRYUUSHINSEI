"use server";

import { auth } from "@/lib/auth";
import {
  db, applications, applicationDocumentChecklist,
  applicantMaster, organizationMaster,
} from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { VISA_TYPE_LABELS } from "@/lib/utils";
import { EMPTY_FORM_DATA } from "@/lib/form-types";

// ─── ファイルをbase64で取得 ───────────────────────────────────────────────────
async function fileToBase64(
  fileUrl: string, mimeType: string | null
): Promise<{ base64: string; mime: string } | null> {
  try {
    let base64: string, mime: string;
    if (fileUrl.startsWith("data:")) {
      const ci = fileUrl.indexOf(",");
      base64 = fileUrl.slice(ci + 1);
      mime = fileUrl.slice(5, ci).split(";")[0];
    } else {
      const res = await fetch(fileUrl, { cache: "no-store" });
      if (!res.ok) return null;
      base64 = Buffer.from(await res.arrayBuffer()).toString("base64");
      mime = mimeType ?? "image/jpeg";
    }
    const ok = ["image/jpeg","image/png","image/webp","image/heic","image/heif","application/pdf"];
    if (!ok.includes(mime)) return null;
    return { base64, mime };
  } catch { return null; }
}

// ─── メインアクション ─────────────────────────────────────────────────────────
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

    // ── 2. 提出済み書類を取得 ─────────────────────────────────────────────────
    const checklist = await db.select().from(applicationDocumentChecklist)
      .where(eq(applicationDocumentChecklist.applicationId, applicationId));
    const submitted = checklist.filter(c => c.fileUrl && c.status === "submitted");

    if (submitted.length === 0) {
      return { success: false, error: "提出済みの書類がありません。書類をアップロードしてから実行してください。" };
    }

    // ── 3. 全書類を個別にGeminiで読み取り ────────────────────────────────────
    const ocrPerDoc: { name: string; data: Record<string, any> }[] = [];
    let docsRead = 0;

    for (const doc of submitted.slice(0, 20)) {
      const file = await fileToBase64(doc.fileUrl!, doc.mimeType);
      if (!file) continue;

      try {
        const ocrPrompt = `あなたは在留資格申請書類の専門読み取りAIです。
書類「${doc.documentName}」から読み取れる全情報をJSONで返してください。

【申請人の情報】
申請人氏名: ${applicantNameEn}${applicantNameJa ? `（${applicantNameJa}）` : ""}
※この書類に申請人と別人の情報が混在する場合（扶養者の書類等）、それぞれ区別して抽出してください。

【抽出フィールド】
{
  "doc_type": "書類の種類（例：パスポート、在留カード、婚姻届受理証明書）",
  "subject": "この書類の主体（申請人/扶養者/配偶者/機関など）",
  "family_name_en": "姓（ローマ字）",
  "given_name_en": "名（ローマ字）",
  "family_name_ja": "姓（漢字）",
  "given_name_ja": "名（漢字）",
  "nationality": "国籍・地域",
  "date_of_birth": "生年月日（YYYY-MM-DD）",
  "gender": "性別（M または F）",
  "address": "住所",
  "postal_code": "郵便番号（7桁）",
  "prefecture": "都道府県",
  "city": "市区町村",
  "address_line": "番地・建物・部屋番号",
  "phone": "電話番号",
  "passport_number": "パスポート番号",
  "passport_expiry": "パスポート有効期限（YYYY-MM-DD）",
  "residence_card_number": "在留カード番号",
  "visa_type": "在留資格（日本語）",
  "visa_period": "在留期間（例：3年、1年）",
  "visa_expiry": "在留期間満了日（YYYY-MM-DD）",
  "place_of_birth": "出生地",
  "marital_status": "配偶者の有無（有 または 無）",
  "occupation": "職業",
  "home_town": "本国居住地",
  "company_name": "勤務先・機関名",
  "company_branch": "支店・事業所名",
  "corporate_number": "法人番号（13桁）",
  "company_address": "勤務先所在地",
  "company_phone": "勤務先電話番号",
  "position": "役職・職種",
  "annual_salary": "年収（数値のみ・円）",
  "monthly_salary": "月収（数値のみ・円）",
  "employment_start": "雇用開始日（YYYY-MM-DD）",
  "employment_end": "雇用終了日（YYYY-MM-DD。現職はnull）",
  "school_name": "学校名",
  "degree": "学位・区分",
  "major": "専攻",
  "graduation_date": "卒業日（YYYY-MM-DD）",
  "enrollment_date": "入学日（YYYY-MM-DD）",
  "annual_tuition": "年間学費（数値のみ・円）",
  "marriage_date": "婚姻年月日（YYYY-MM-DD）",
  "marriage_notification_place_japan": "日本国届出先（市区町村役場名）",
  "marriage_notification_date_japan": "日本国届出年月日（YYYY-MM-DD）",
  "marriage_notification_place_foreign": "本国等届出先（機関名）",
  "marriage_notification_date_foreign": "本国等届出年月日（YYYY-MM-DD）",
  "relationship_to_applicant": "申請人との続柄（扶養者書類の場合: 夫/妻/父/母など）",
  "notes": "その他重要事項"
}

読み取れない項目はnull。JSONのみ返答。`;

        const resp = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{ parts: [
            { inlineData: { mimeType: file.mime, data: file.base64 } },
            { text: ocrPrompt },
          ]}],
        });

        const txt = resp.text ?? "{}";
        const m = txt.match(/```json\s*([\s\S]*?)```/) ?? txt.match(/(\{[\s\S]*\})/);
        if (m) {
          const data = JSON.parse(m[1] ?? m[0]);
          ocrPerDoc.push({ name: doc.documentName, data });
          docsRead++;
        }
      } catch { /* 1書類エラーは無視 */ }
    }

    if (ocrPerDoc.length === 0) {
      return { success: false, error: "書類の読み取りに失敗しました。書類の形式を確認してください。" };
    }

    // ── 4. 全書類OCR結果を統合サマリーとして構築 ────────────────────────────
    const docSummary = ocrPerDoc.map((d, i) =>
      `【書類${i + 1}: ${d.name}】\n${JSON.stringify(d.data, null, 2)}`
    ).join("\n\n");

    // ── 5. 申請人マスターの確定値をベースに構築 ──────────────────────────────
    const toJaVisa = (v: string | null | undefined) =>
      v ? (VISA_TYPE_LABELS[v] ?? v) : "";

    const masterBase: Record<string, any> = {
      // 申請人マスターから確定値（常にこれを優先）
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
      passportNumber:           applicant?.passportNumber ?? "",
      passportExpiry:           applicant?.passportExpiry ?? "",
      currentStatusOfResidence: toJaVisa(applicant?.currentVisaType),
      currentPeriodExpiry:      applicant?.currentVisaExpiry ?? "",
      residenceCardNumber:      applicant?.residenceCardNumber ?? "",
      desiredStatusOfResidence: app.visaType ?? "",
      // 組織マスター
      employerName:    org?.nameJa ?? "",
      employerAddress: [org?.prefecture, org?.city, org?.addressLine].filter(Boolean).join(""),
      employerPhone:   org?.phone ?? "",
      orgName:         org?.nameJa ?? "",
      orgCorporateNumber: org?.corporateNumber ?? "",
      orgAddress:      [org?.prefecture, org?.city, org?.addressLine].filter(Boolean).join(""),
      orgPhone:        org?.phone ?? "",
      orgCapital:      org?.capital ? String(org.capital) : "",
      orgEmployeeCount: org?.employeeCount ? String(org.employeeCount) : "",
      // 取次者固定
      agentName:         "山口忠士",
      agentOrganization: "兵庫県行政書士会",
      agentAddress:      "〒665-0864 兵庫県宝塚市泉町22-25 島上マンション南棟1-B",
      agentPhone:        "090-2596-0128",
    };

    // ── 6. 包括的Geminiコール：全フィールドを一括入力 ─────────────────────────
    const synthPrompt = `あなたは在留資格申請の専門行政書士AIです。
以下の${docsRead}件の書類から読み取った情報を精査して、申請書の全フィールドを埋めてください。

━━ 申請人情報（確定値・変更不可） ━━
氏名: ${applicantNameEn}${applicantNameJa ? `（${applicantNameJa}）` : ""}
国籍: ${applicant?.nationality ?? "不明"} / 在留資格: ${applicant?.currentVisaType ?? "不明"}
申請種別: ${app.applicationType} / 申請在留資格: ${app.visaType ?? ""}

━━ 読み取り済み書類（${docsRead}件） ━━
${docSummary}

━━ 所属機関情報 ━━
${org ? `${org.nameJa ?? ""} / 法人番号: ${org.corporateNumber ?? ""} / ${[org.prefecture, org.city, org.addressLine].filter(Boolean).join("")}` : "（なし）"}

上記の書類情報を精査し、以下のJSONフィールドをすべて埋めてください。
【重要ルール】
・書類に明記されている情報を最優先（推測・補完は最小限）
・日付はYYYY-MM-DD形式
・有無は「有」または「無」（英語不可）
・性別は「男」または「女」（英語不可）
・数値フィールドは数値のみ（単位・記号不可）
・不明・書類に記載なしは ""（空文字列）
・JSONのみ返し、説明文は不要

{
  "placeOfBirth": "出生地（都市・国名）",
  "maritalStatus": "配偶者の有無（有 または 無）",
  "occupation": "職業（例：会社員、主婦、留学生）",
  "homeTownCity": "本国における居住地（都市・国名）",
  "cellularPhoneNo": "携帯電話番号",

  "currentPeriodOfStay": "現在の在留期間の長さ（例：3年、1年）",
  "desiredPeriodOfStay": "希望する在留期間（例：3年）",
  "reasonForApplication": "更新・変更の理由（書類から読み取れる事実を具体的に記述）",

  "criminalRecord": "犯罪記録の有無（有 または 無）",
  "criminalRecordDetail": "犯罪記録の詳細（有の場合のみ）",
  "familyInJapanExists": "在日親族の有無（有 または 無）",

  "employerBranchName": "勤務先支店・事業所名",
  "salary": "給与・報酬額（数値のみ・円）",
  "salaryType": "給与種別（月額 または 年額）",
  "position": "職務上の地位・役職名",
  "activityDetails": "業務内容・活動の詳細",
  "employmentStartDate": "雇用開始年月日（YYYY-MM-DD）",
  "workPeriodFixed": "就労予定期間（定めなし または 定めあり）",
  "workPeriodDuration": "就労期間（定めありの場合のみ）",
  "businessExperienceYears": "実務経験年数（数値のみ）",

  "educationCountry": "学校所在国（本邦（日本） または 外国）",
  "educationDegree": "学位（大学院（博士）/大学院（修士）/大学/短期大学/専門学校/高等学校等）",
  "educationSchoolName": "学校名（正式名称）",
  "educationGraduationDate": "卒業年月日（YYYY-MM-DD）",
  "majorCategory": "専攻・専門分野",
  "itQualificationExists": "情報処理技術者資格の有無（有 または 無）",
  "itQualificationName": "資格名（有の場合）",

  "workHistory": [
    {"joinDate": "入社年月（YYYY-MM）", "leaveDate": "退社年月（YYYY-MM。現職は空文字）", "employer": "勤務先名称"}
  ],

  "marriageNotificationPlaceJapan": "日本の市区町村役場への届出先（役場名）",
  "marriageNotificationDateJapan": "日本への届出年月日（YYYY-MM-DD）",
  "marriageNotificationPlaceForeign": "本国等の機関への届出先（機関名）",
  "marriageNotificationDateForeign": "本国等への届出年月日（YYYY-MM-DD）",
  "fundingMethod": "滞在費支弁方法（親族負担/外国からの送金/身元保証人負担/その他）",
  "partTimeWorkExistsR": "資格外活動の有無（有 または 無）",

  "supporterNameEn": "扶養者 氏名（ローマ字。姓名を半角スペース区切りで。例：YAMADA Taro）",
  "supporterFamilyNameJa": "扶養者 氏名（漢字。姓名を半角スペース区切りで。例：ファム ティ トム）",
  "supporterDob": "扶養者 生年月日（YYYY-MM-DD）",
  "supporterNationality": "扶養者 国籍・地域",
  "supporterResidenceCard": "扶養者 在留カード番号（英数字12桁）",
  "supporterStatusOfResidence": "扶養者 在留資格（日本語）",
  "supporterPeriodOfStay": "扶養者 在留期間の長さ（例：3年）",
  "supporterPeriodExpiry": "扶養者 在留期間満了日（YYYY-MM-DD）",
  "supporterRelationship": "申請人との続柄（夫/妻/父/母/養父/養母/その他）",
  "supporterEmployer": "扶養者 勤務先名称",
  "supporterCorporateNumber": "扶養者 法人番号（13桁）",
  "supporterBranchName": "扶養者 支店・事業所名",
  "supporterEmployerAddress": "扶養者 勤務先所在地（フル住所）",
  "supporterEmployerPhone": "扶養者 勤務先電話番号",
  "supporterAnnualIncome": "扶養者 年収（数値のみ・円）",

  "spouseFamilyNameEn": "配偶者 姓（ローマ字）",
  "spouseGivenNameEn": "配偶者 名（ローマ字）",
  "spouseFamilyNameJa": "配偶者 姓（漢字）",
  "spouseGivenNameJa": "配偶者 名（漢字）",
  "spouseDob": "配偶者 生年月日（YYYY-MM-DD）",
  "spouseNationality": "配偶者 国籍",
  "spouseResidenceStatus": "配偶者 身分（日本国籍/永住者/特別永住者）",
  "spouseResidenceCard": "配偶者 在留カード番号",
  "spouseOccupation": "配偶者 職業",
  "spouseEmployer": "配偶者 勤務先・通学先",
  "spouseAddress": "配偶者 住所",
  "marriageDate": "婚姻年月日（YYYY-MM-DD）",
  "marriageRegistrationPlace": "婚姻届出市区町村名",
  "cohabitation": "同居の有無（有 または 無）",

  "schoolName": "学校名（正式名称）",
  "schoolType": "学校種別（大学院/大学/短期大学/専門学校/高等学校/日本語学校/その他）",
  "schoolAddress": "学校所在地",
  "schoolPhone": "学校電話番号",
  "enrollmentDate": "入学年月日（YYYY-MM-DD）",
  "expectedGraduationDate": "卒業予定年月日（YYYY-MM-DD）",
  "courseOfStudy": "在籍コース・専攻名",
  "annualTuition": "年間学費（数値のみ・円）",
  "fundingSource": "費用支弁方法",
  "fundingAmount": "月額生活費（数値のみ・円）",
  "partTimeWorkPermit": "資格外活動許可の有無（有 または 無）",

  "orgBranchName": "所属機関 支店・事業所名",
  "orgEmploymentInsuranceNo": "雇用保険適用事業所番号（11桁）",
  "orgAnnualSales": "年間売上高（数値のみ・円）",
  "orgForeignEmployeeCount": "外国人職員数（数値のみ）",
  "contractType": "契約形態（雇用/委任/請負/その他）",
  "occupationCode": "職種コード番号"
}`;

    const synthResp = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ parts: [{ text: synthPrompt }] }],
    });

    const synthTxt = synthResp.text ?? "{}";
    const synthM = synthTxt.match(/```json\s*([\s\S]*?)```/) ?? synthTxt.match(/(\{[\s\S]*\})/);
    const aiData: Record<string, any> = synthM ? JSON.parse(synthM[1] ?? synthM[0]) : {};

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

    // マスター確定値を最後に上書き（変更不可フィールド）
    Object.assign(merged, masterBase);

    // ── 7-b. 家族滞在（認定・更新・変更すべて）の場合、扶養者情報を在日親族に自動反映 ──
    if (app.visaType === 'dependent') {
      const supporterName = [merged.supporterFamilyNameJa, merged.supporterGivenNameJa].filter(Boolean).join(' ')
        || merged.supporterNameEn
        || [merged.supporterFamilyNameEn, merged.supporterGivenNameEn].filter(Boolean).join(' ');
      if (supporterName) {
        const familyList = (merged.familyInJapan ?? []) as any[];
        // 既に同名の扶養者が登録されていなければ追加
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

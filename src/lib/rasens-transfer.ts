/**
 * RASENS（在留申請オンラインシステム）転記データ生成
 *
 * JLSシステムの申請データをRASENSへ手動転記するための
 * フィールドマッピングとセクション分けロジック。
 *
 * フォーマット規則:
 * - 日付: YYYYMMDD（ハイフンなし）
 * - 住所: 郵便番号と分離、都道府県市区町村/番地以降で分割、全角
 * - 電話番号: ハイフンなし
 */

import type { ApplicationFormData, FamilyMember } from "@/lib/form-types";

export interface RasensField {
  /** RASENSページ上のラベルテキスト */
  label: string;
  /** 入力する値 */
  value: string;
  /** 補足メモ */
  note?: string;
}

// ─── ユーティリティ関数 ──────────────────────────────────────────────────────

/** 半角数字を全角数字に変換 */
function toFullWidthDigits(str: string): string {
  return str.replace(/[0-9]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) + 0xFEE0)
  );
}

/** 半角英字を全角英字に変換 */
function toFullWidthAlpha(str: string): string {
  return str.replace(/[A-Za-z]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) + 0xFEE0)
  );
}

/** 半角ハイフン・スラッシュ等を全角に変換 */
function toFullWidthSymbols(str: string): string {
  return str
    .replace(/-/g, "ー")
    .replace(/\//g, "／")
    .replace(/\(/g, "（")
    .replace(/\)/g, "）")
    .replace(/\s/g, "　");
}

/** 住所用：文字列を全角に変換（数字・英字・記号） */
function toFullWidthAddress(str: string): string {
  if (!str) return "";
  let result = str;
  result = toFullWidthDigits(result);
  result = toFullWidthAlpha(result);
  result = toFullWidthSymbols(result);
  return result;
}

/** 日付をYYYYMMDD形式に変換（ハイフン除去） */
function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  // YYYY-MM-DD → YYYYMMDD
  return dateStr.replace(/-/g, "").replace(/\//g, "");
}

/** 電話番号からハイフンを除去 */
function formatPhone(phone: string): string {
  if (!phone) return "";
  return phone.replace(/-/g, "").replace(/\s/g, "");
}

/** 郵便番号からハイフンを除去 */
function formatPostalCode(code: string): string {
  if (!code) return "";
  return code.replace(/-/g, "").replace(/\s/g, "");
}

/** JLSフォームデータからRASENSフィールド一覧を生成 */
export function buildRasensFields(
  form: Partial<ApplicationFormData>,
  applicant?: {
    familyNameEn?: string;
    givenNameEn?: string;
    familyNameJa?: string | null;
    givenNameJa?: string | null;
    nationality?: string;
    dateOfBirth?: string | null;
    gender?: string | null;
    passportNumber?: string | null;
    residenceCardNumber?: string | null;
    phone?: string | null;
  }
): RasensField[] {
  const f = form;

  const nationality   = f.nationality   || applicant?.nationality   || "";
  const familyNameEn  = f.familyNameEn  || applicant?.familyNameEn  || "";
  const givenNameEn   = f.givenNameEn   || applicant?.givenNameEn   || "";
  const familyNameJa  = f.familyNameJa  || applicant?.familyNameJa  || "";
  const givenNameJa   = f.givenNameJa   || applicant?.givenNameJa   || "";
  const dob           = f.dateOfBirth   || applicant?.dateOfBirth   || "";
  const sex           = f.sex           || applicant?.gender        || "";
  const passportNum   = f.passportNumber || applicant?.passportNumber || "";
  const residenceCard = f.residenceCardNumber || applicant?.residenceCardNumber || "";
  const phone         = f.telephoneNo   || applicant?.phone         || "";
  const cellPhone     = f.cellularPhoneNo || "";
  const occupation    = f.occupation    || "";

  // ── 住所の処理 ──
  // 郵便番号（ハイフンなし）
  const postalCode = formatPostalCode(f.postalCodeInJapan || "");

  // 都道府県＋市区町村（全角）
  const prefCity = toFullWidthAddress(
    `${f.prefectureInJapan ?? ""}${f.cityInJapan ?? ""}`
  );

  // 番地以降（全角）
  const addressLine = toFullWidthAddress(f.addressLineInJapan ?? "");

  const fields: RasensField[] = [
    // ── 申請人 基本情報 ──────────────────────────────────────────────
    { label: "国籍・地域",        value: nationality },
    { label: "生年月日",          value: formatDate(dob),    note: "YYYYMMDD" },
    { label: "氏名（ローマ字）",  value: `${familyNameEn}　${givenNameEn}`.trim(), note: "姓　名" },
    ...(familyNameJa || givenNameJa
      ? [{ label: "氏名（漢字等）", value: `${familyNameJa}　${givenNameJa}`.trim() }]
      : []),
    { label: "性別",              value: sex },
    { label: "配偶者の有無",      value: f.maritalStatus || "" },
    { label: "職業",              value: occupation },

    // ── 住所（郵便番号と分離、都道府県市区町村/番地以降で分割、全角）──
    ...(postalCode ? [{ label: "郵便番号", value: postalCode, note: "ハイフンなし" }] : []),
    ...(prefCity   ? [{ label: "住居地（都道府県・市区町村）", value: prefCity }] : []),
    ...(addressLine ? [{ label: "住居地（番地以降）", value: addressLine }] : []),
    // フォールバック: 分割入力がない場合
    ...(!prefCity && !addressLine && f.addressInJapan
      ? [{ label: "住居地", value: toFullWidthAddress(f.addressInJapan) }]
      : []),

    // ── 電話番号（ハイフンなし）──
    { label: "電話番号",          value: formatPhone(phone),     note: "ハイフンなし" },
    ...(cellPhone ? [{ label: "携帯電話番号", value: formatPhone(cellPhone), note: "ハイフンなし" }] : []),

    // ── 旅券・在留情報 ───────────────────────────────────────────────
    { label: "旅券番号",          value: passportNum },
    { label: "旅券有効期限",      value: formatDate(f.passportExpiry || ""), note: "YYYYMMDD" },
    { label: "現在の在留資格",    value: f.currentStatusOfResidence || "" },
    { label: "在留期間",          value: f.currentPeriodOfStay || "" },
    { label: "在留期間の満了日",  value: formatDate(f.currentPeriodExpiry || ""), note: "YYYYMMDD" },
    { label: "在留カード番号",    value: residenceCard },

    // ── 申請内容 ─────────────────────────────────────────────────────
    { label: "希望する在留期間",  value: f.desiredPeriodOfStay || "" },
    ...(f.reasonForApplication
      ? [{ label: "更新の理由",   value: f.reasonForApplication }]
      : []),
    { label: "犯罪記録の有無",    value: f.criminalRecord || "無" },
    { label: "退去強制歴の有無",  value: f.deportationHistory || "無" },

    // ── 在日親族及び同居者 ────────────────────────────────────────────
    ...buildFamilyInJapanFields(f),

    // ── 届出情報（配偶者: 婚姻届出、子: 出生届出/縁組届出）────────────
    ...buildNotificationFields(f),

    // ── 扶養者情報（家族滞在） ────────────────────────────────────────
    ...(f.supporterFamilyNameEn ? [
      { label: "扶養者　氏名（ローマ字）",
        value: `${f.supporterFamilyNameEn ?? ""}　${f.supporterGivenNameEn ?? ""}`.trim() },
      ...(f.supporterFamilyNameJa
        ? [{ label: "扶養者　氏名（漢字等）",
             value: `${f.supporterFamilyNameJa ?? ""}　${f.supporterGivenNameJa ?? ""}`.trim() }]
        : []),
      { label: "扶養者　生年月日",        value: formatDate(f.supporterDob || ""),  note: "YYYYMMDD" },
      { label: "扶養者　国籍・地域",      value: f.supporterNationality || "" },
      { label: "扶養者　在留資格",        value: f.supporterStatusOfResidence || "" },
      { label: "扶養者　在留期間",        value: f.supporterPeriodOfStay || "" },
      { label: "扶養者　在留期間満了日",  value: formatDate(f.supporterPeriodExpiry || ""), note: "YYYYMMDD" },
      { label: "扶養者　在留カード番号",  value: f.supporterResidenceCard || "" },
      { label: "申請人との関係",          value: f.supporterRelationship || "" },
      { label: "扶養者　勤務先名称",      value: f.supporterEmployer || "" },
      ...(f.supporterAnnualIncome
        ? [{ label: "扶養者　年収", value: `${Number(f.supporterAnnualIncome).toLocaleString()} 円` }]
        : []),
    ] : []),

    // ── 資格外活動許可申請書 ──────────────────────────────────────────
    ...buildGaikatsuFields(f),

    // ── 取次者情報（固定） ────────────────────────────────────────────
    { label: "取次者　氏名",      value: "山口忠士" },
    { label: "取次者　電話番号",  value: "09025960128", note: "ハイフンなし" },
    { label: "取次者　所属機関等", value: "兵庫県行政書士会" },
    { label: "取次者　郵便番号",  value: "6650864", note: "ハイフンなし" },
    { label: "取次者　住所（都道府県・市区町村）",
      value: "兵庫県宝塚市" },
    { label: "取次者　住所（番地以降）",
      value: "泉町２２ー２５　島上マンション南棟１ーＢ" },
  ];

  return fields.filter((f) => f.value.trim() !== "");
}

/** 在日親族及び同居者フィールドを生成 */
function buildFamilyInJapanFields(f: Partial<ApplicationFormData>): RasensField[] {
  const fields: RasensField[] = [];

  // 在日親族の有無
  fields.push({
    label: "在日親族及び同居者の有無",
    value: f.familyInJapanExists || "無",
  });

  // 親族情報を展開
  const family = f.familyInJapan || [];
  if (family.length === 0) return fields;

  family.forEach((member: FamilyMember, idx: number) => {
    const num = idx + 1;
    const prefix = `親族${num}`;

    if (member.relationship) {
      fields.push({ label: `${prefix}　続柄`, value: member.relationship });
    }
    if (member.name) {
      fields.push({ label: `${prefix}　氏名`, value: member.name });
    }
    if (member.dateOfBirth) {
      fields.push({ label: `${prefix}　生年月日`, value: formatDate(member.dateOfBirth), note: "YYYYMMDD" });
    }
    if (member.nationality) {
      fields.push({ label: `${prefix}　国籍・地域`, value: member.nationality });
    }
    if (member.placeOfEmployment) {
      fields.push({ label: `${prefix}　勤務先・通学先`, value: member.placeOfEmployment });
    }
    fields.push({
      label: `${prefix}　同居の有無`,
      value: member.residingTogether ? "有" : "無",
    });
    if (member.residenceCardNumber) {
      fields.push({ label: `${prefix}　在留カード番号`, value: member.residenceCardNumber });
    }
  });

  return fields;
}

/** 届出情報フィールドを生成（配偶者: 婚姻届出、子: 出生届出/縁組届出）*/
function buildNotificationFields(f: Partial<ApplicationFormData>): RasensField[] {
  const fields: RasensField[] = [];

  // R型（家族滞在）の婚姻・出生届出情報
  if (f.marriageNotificationPlaceJapan || f.marriageNotificationDateJapan) {
    fields.push({
      label: "届出先（日本）",
      value: f.marriageNotificationPlaceJapan || "",
      note: "婚姻/出生/縁組",
    });
    if (f.marriageNotificationDateJapan) {
      fields.push({
        label: "届出年月日（日本）",
        value: formatDate(f.marriageNotificationDateJapan),
        note: "YYYYMMDD",
      });
    }
  }

  if (f.marriageNotificationPlaceForeign || f.marriageNotificationDateForeign) {
    fields.push({
      label: "届出先（本国等）",
      value: f.marriageNotificationPlaceForeign || "",
      note: "婚姻/出生/縁組",
    });
    if (f.marriageNotificationDateForeign) {
      fields.push({
        label: "届出年月日（本国等）",
        value: formatDate(f.marriageNotificationDateForeign),
        note: "YYYYMMDD",
      });
    }
  }

  // T型（日本人配偶者等）の婚姻届出情報
  if (f.marriageRegistrationPlace || f.marriageRegistrationDate) {
    // 重複防止（R型と同時に入ることはないが念のため）
    if (!f.marriageNotificationPlaceJapan && !f.marriageNotificationDateJapan) {
      if (f.marriageRegistrationPlace) {
        fields.push({
          label: "婚姻届出先",
          value: f.marriageRegistrationPlace,
        });
      }
      if (f.marriageRegistrationDate) {
        fields.push({
          label: "婚姻届出年月日",
          value: formatDate(f.marriageRegistrationDate),
          note: "YYYYMMDD",
        });
      }
    }
  }

  if (f.marriageDate) {
    fields.push({
      label: "婚姻年月日",
      value: formatDate(f.marriageDate),
      note: "YYYYMMDD",
    });
  }

  return fields;
}

/** 資格外活動許可申請書フィールドを生成 */
function buildGaikatsuFields(f: Partial<ApplicationFormData>): RasensField[] {
  const needsGaikatsu =
    f.gaikatsuNeeded === "有" ||
    f.gaikatsuEmployerName ||
    f.gaikatsuCurrentActivity ||
    f.partTimeWorkExistsR === "有" ||
    f.partTimeWorkOrgNameR;

  if (!needsGaikatsu) return [];

  const employerName    = f.gaikatsuEmployerName    || f.partTimeWorkOrgNameR    || "";
  const employerBranch  = f.partTimeWorkBranchNameR || "";
  const employerAddress = f.gaikatsuEmployerAddress || "";
  const employerPhone   = f.gaikatsuEmployerPhone   || f.partTimeWorkPhoneR      || "";
  const bizType         = f.gaikatsuEmployerBusinessType || f.partTimeWorkTypeR  || "";
  const weeklyHours     = f.gaikatsuWeeklyHours     || f.partTimeWorkHoursR      || "";
  const salary          = f.gaikatsuSalary          || f.partTimeWorkSalaryR     || "";
  const salaryType      = f.gaikatsuSalaryType      || f.partTimeWorkSalaryTypeR || "";
  const activityType    = f.gaikatsuActivityType
    ? f.gaikatsuActivityType === "その他"
      ? `その他（${f.gaikatsuActivityTypeOther ?? ""}）`
      : f.gaikatsuActivityType
    : "";
  const salaryStr = salary
    ? `${Number(salary).toLocaleString()} 円（${salaryType}）`
    : "";

  return [
    { label: "資格外　現在の在留活動の内容",      value: f.gaikatsuCurrentActivity || "" },
    ...(activityType
      ? [{ label: "資格外　他に従事する活動（職務の内容）", value: activityType }]
      : []),
    { label: "資格外　雇用契約期間",              value: f.gaikatsuContractPeriod || "" },
    ...(weeklyHours
      ? [{ label: "資格外　週間稼働時間",          value: `${weeklyHours} 時間` }]
      : []),
    ...(salaryStr
      ? [{ label: "資格外　報酬",                  value: salaryStr }]
      : []),
    { label: "資格外　勤務先名称",                 value: employerName },
    ...(employerBranch
      ? [{ label: "資格外　支店・事業所名",         value: employerBranch }]
      : []),
    { label: "資格外　勤務先所在地",               value: toFullWidthAddress(employerAddress) },
    { label: "資格外　勤務先電話番号",             value: formatPhone(employerPhone), note: "ハイフンなし" },
    ...(bizType
      ? [{ label: "資格外　業種",                  value: bizType }]
      : []),
  ].filter((item) => item.value.trim() !== "");
}

/** セクション別に分類 */
export function buildTransferSections(fields: RasensField[]) {
  const sections: { title: string; fields: RasensField[] }[] = [
    { title: "申請人　基本情報",            fields: [] },
    { title: "旅券・在留情報",              fields: [] },
    { title: "申請内容",                    fields: [] },
    { title: "在日親族及び同居者",          fields: [] },
    { title: "届出情報",                    fields: [] },
    { title: "扶養者情報",                  fields: [] },
    { title: "資格外活動許可申請書",        fields: [] },
    { title: "取次者情報（固定）",          fields: [] },
  ];

  fields.forEach((f) => {
    const l = f.label;
    if (l.startsWith("取次者"))                                            sections[7].fields.push(f);
    else if (l.startsWith("資格外"))                                       sections[6].fields.push(f);
    else if (l.startsWith("扶養者") || l === "申請人との関係")             sections[5].fields.push(f);
    else if (l.includes("届出") || l === "婚姻年月日")                    sections[4].fields.push(f);
    else if (l.startsWith("親族") || l === "在日親族及び同居者の有無")     sections[3].fields.push(f);
    else if (["希望する","更新の理由","犯罪","退去"].some(k => l.includes(k)))  sections[2].fields.push(f);
    else if (["旅券","在留資格","在留期間","在留カード"].some(k => l.includes(k))) sections[1].fields.push(f);
    else                                                                    sections[0].fields.push(f);
  });

  return sections.filter((s) => s.fields.length > 0);
}

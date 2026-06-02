/**
 * RASENS（在留申請オンラインシステム）転記データ生成
 *
 * JLSシステムの申請データをRASENSへ手動転記するための
 * フィールドマッピングとセクション分けロジック。
 */

import type { ApplicationFormData } from "@/lib/form-types";

export interface RasensField {
  /** RASENSページ上のラベルテキスト */
  label: string;
  /** 入力する値 */
  value: string;
  /** 補足メモ */
  note?: string;
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

  const address = (() => {
    if (f.prefectureInJapan || f.cityInJapan || f.addressLineInJapan) {
      const zip = f.postalCodeInJapan ? `〒${f.postalCodeInJapan}　` : "";
      return `${zip}${f.prefectureInJapan ?? ""}${f.cityInJapan ?? ""}${f.addressLineInJapan ?? ""}`;
    }
    return f.addressInJapan || "";
  })();

  const fields: RasensField[] = [
    // ── 申請人 基本情報 ──────────────────────────────────────────────
    { label: "国籍・地域",        value: nationality },
    { label: "生年月日",          value: dob,           note: "YYYY-MM-DD" },
    { label: "氏名（ローマ字）",  value: `${familyNameEn}　${givenNameEn}`.trim(), note: "姓　名" },
    ...(familyNameJa || givenNameJa
      ? [{ label: "氏名（漢字等）", value: `${familyNameJa}　${givenNameJa}`.trim() }]
      : []),
    { label: "性別",              value: sex },
    { label: "住居地（日本）",    value: address },
    { label: "電話番号",          value: phone },
    ...(cellPhone ? [{ label: "携帯電話番号", value: cellPhone }] : []),

    // ── 旅券・在留情報 ───────────────────────────────────────────────
    { label: "旅券番号",          value: passportNum },
    { label: "旅券有効期限",      value: f.passportExpiry || "", note: "YYYY-MM-DD" },
    { label: "現在の在留資格",    value: f.currentStatusOfResidence || "" },
    { label: "在留期間",          value: f.currentPeriodOfStay || "" },
    { label: "在留期間の満了日",  value: f.currentPeriodExpiry || "", note: "YYYY-MM-DD" },
    { label: "在留カード番号",    value: residenceCard },

    // ── 申請内容 ─────────────────────────────────────────────────────
    { label: "希望する在留期間",  value: f.desiredPeriodOfStay || "" },
    ...(f.reasonForApplication
      ? [{ label: "更新の理由",   value: f.reasonForApplication }]
      : []),
    { label: "犯罪記録の有無",    value: f.criminalRecord || "無" },
    { label: "退去強制歴の有無",  value: f.deportationHistory || "無" },

    // ── 扶養者情報（家族滞在） ────────────────────────────────────────
    ...(f.supporterFamilyNameEn ? [
      { label: "扶養者　氏名（ローマ字）",
        value: `${f.supporterFamilyNameEn ?? ""}　${f.supporterGivenNameEn ?? ""}`.trim() },
      ...(f.supporterFamilyNameJa
        ? [{ label: "扶養者　氏名（漢字等）",
             value: `${f.supporterFamilyNameJa ?? ""}　${f.supporterGivenNameJa ?? ""}`.trim() }]
        : []),
      { label: "扶養者　生年月日",        value: f.supporterDob || "",            note: "YYYY-MM-DD" },
      { label: "扶養者　国籍・地域",      value: f.supporterNationality || "" },
      { label: "扶養者　在留資格",        value: f.supporterStatusOfResidence || "" },
      { label: "扶養者　在留期間",        value: f.supporterPeriodOfStay || "" },
      { label: "扶養者　在留期間満了日",  value: f.supporterPeriodExpiry || "",   note: "YYYY-MM-DD" },
      { label: "扶養者　在留カード番号",  value: f.supporterResidenceCard || "" },
      { label: "申請人との関係",          value: f.supporterRelationship || "" },
      { label: "扶養者　勤務先名称",      value: f.supporterEmployer || "" },
      ...(f.supporterAnnualIncome
        ? [{ label: "扶養者　年収", value: `${Number(f.supporterAnnualIncome).toLocaleString()} 円` }]
        : []),
    ] : []),

    // ── 取次者情報（固定） ────────────────────────────────────────────
    { label: "取次者　氏名",      value: "山口忠士" },
    { label: "取次者　電話番号",  value: "090-2596-0128" },
    { label: "取次者　所属機関等", value: "兵庫県行政書士会" },
    { label: "取次者　住所",
      value: "〒665-0864 兵庫県宝塚市泉町22-25 島上マンション南棟1-B" },
  ];

  return fields.filter((f) => f.value.trim() !== "");
}

/** セクション別に分類 */
export function buildTransferSections(fields: RasensField[]) {
  const sections: { title: string; fields: RasensField[] }[] = [
    { title: "申請人　基本情報",   fields: [] },
    { title: "旅券・在留情報",     fields: [] },
    { title: "申請内容",           fields: [] },
    { title: "扶養者情報",         fields: [] },
    { title: "取次者情報（固定）", fields: [] },
  ];

  fields.forEach((f) => {
    const l = f.label;
    if (l.startsWith("取次者"))                                  sections[4].fields.push(f);
    else if (l.startsWith("扶養者") || l === "申請人との関係")   sections[3].fields.push(f);
    else if (["希望する","更新の理由","犯罪","退去"].some(k => l.includes(k))) sections[2].fields.push(f);
    else if (["旅券","在留資格","在留期間","在留カード"].some(k => l.includes(k))) sections[1].fields.push(f);
    else                                                          sections[0].fields.push(f);
  });

  return sections.filter((s) => s.fields.length > 0);
}

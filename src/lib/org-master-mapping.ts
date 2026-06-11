// ─────────────────────────────────────────────────────────────────────────────
// 所属機関マスター（organization_master）共通項目の定義と申請書マッピング
//
// 【設計基準】所属機関マスターに保持・申請書へ自動反映してよいのは、
// 「すべての在留資格（特定技能・家族滞在・技人国等）・すべての申請書類で
//  共通して使い回せる企業の基本属性」だけに限定する。
//
//   ○ マスターに含めてよい項目（共通属性）:
//     氏名又は名称 / 法人番号 / 代表者の役職・氏名 / 住所 / 電話・FAX・メール /
//     業種 / 資本金 / 年間売上高 / 常勤職員数 / 雇用保険適用事業所番号 /
//     健康保険・厚生年金保険事業所整理記号等 / 労働保険番号
//
//   × マスターに含めてはならない項目（申請・契約ごとに変動する）:
//     特定の申請外国人に関する情報 / 雇用契約期間 / 就業場所 /
//     基本給・手当の額 等 → applications.formData（申請データ）側で保持する。
//
// マスターへ項目を追加する場合は、必ず「すべての申請書で共通する企業属性か？」
// を確認し、共通属性であれば ORG_MASTER_COMMON_FIELD_KEYS にキーを追加すること。
// 在留資格固有の項目は applications.formData または拡張用の別テーブルに置く。
// ─────────────────────────────────────────────────────────────────────────────
import type { ApplicationFormData } from "@/lib/form-types";
import { BUSINESS_TYPES } from "@/lib/form-types";

/**
 * 所属機関マスターで管理を許可する「全申請書共通項目」のホワイトリスト。
 * createOrganization / updateOrganization はこのキー以外の入力を破棄する。
 */
export const ORG_MASTER_COMMON_FIELD_KEYS = [
  // 氏名又は名称
  "nameJa", "nameEn",
  // 法人番号（13桁）
  "corporateNumber",
  // 代表者の役職・氏名
  "representativeTitle", "representativeName",
  // 住所（本店所在地 / 連絡先）
  "postalCode", "prefecture", "city", "addressLine",
  // 電話番号 / FAX番号 / メールアドレス
  "phone", "fax", "email",
  // 業種（メインの事業内容）・カテゴリー（入管区分。企業規模等で決まる共通属性）
  "industry", "category",
  // 資本金又は出資金の額 / 直近の年間売上高 / 常勤職員数 / 決算期
  "capital", "annualSales", "employeeCount", "fiscalYearEnd",
  // 雇用保険適用事業所番号 / 健康保険・厚生年金保険事業所整理記号等 / 労働保険番号（労災含む）
  "employmentInsuranceNo", "socialInsuranceSymbol", "laborInsuranceNo", "workersAccidentInsuranceNo",
] as const;

export type OrgMasterCommonFieldKey = (typeof ORG_MASTER_COMMON_FIELD_KEYS)[number];

/**
 * 入力オブジェクトから「全申請書共通項目」のキーだけを残すフィルタ。
 * マスターの項目拡張時に申請固有データが混入するのを防ぐバリデーションとして
 * createOrganization / updateOrganization で必ず通すこと。
 */
export function pickOrgCommonFields<T extends Record<string, unknown>>(
  data: T
): Partial<Record<OrgMasterCommonFieldKey, any>> {
  const allowed = new Set<string>(ORG_MASTER_COMMON_FIELD_KEYS);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (allowed.has(key)) {
      result[key] = value;
    } else if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[org-master] "${key}" は全申請書共通項目ではないためマスターに保存できません。` +
        `申請固有の値は applications.formData 側で保持してください。`
      );
    }
  }
  return result as Partial<Record<OrgMasterCommonFieldKey, any>>;
}

/** organization_master の行（共通項目のみを参照する構造的型） */
export interface OrgMasterRecord {
  nameJa?: string | null;
  nameEn?: string | null;
  corporateNumber?: string | null;
  representativeTitle?: string | null;
  representativeName?: string | null;
  postalCode?: string | null;
  prefecture?: string | null;
  city?: string | null;
  addressLine?: string | null;
  phone?: string | null;
  fax?: string | null;
  email?: string | null;
  industry?: string | null;
  category?: string | null;
  capital?: number | null;
  annualSales?: number | null;
  employeeCount?: number | null;
  employmentInsuranceNo?: string | null;
  socialInsuranceSymbol?: string | null;
  laborInsuranceNo?: string | null;
  workersAccidentInsuranceNo?: string | null;
}

/** 業種の自由テキストを BUSINESS_TYPES のコードに変換（一致しなければ空） */
function industryToBusinessTypeCode(industry: string | null | undefined): string {
  if (!industry) return "";
  const norm = (s: string) => s.replace(/業$/, "").trim();
  const hit = BUSINESS_TYPES.find(
    b => b.label === industry || norm(b.label) === norm(industry)
      || norm(industry).includes(norm(b.label)) || norm(b.label).includes(norm(industry))
  );
  return hit ? String(hit.code) : "";
}

/**
 * 所属機関マスター → 申請書フォーム（ApplicationFormData）への自動反映マッピング。
 *
 * ここで反映するのは「全申請書共通の企業基本情報」だけ。
 * 雇用契約期間・就業場所・給与額などの申請固有項目は、雇用条件書AI抽出や
 * 手入力など申請データ側のフローで設定するため、本関数では一切扱わない。
 *
 * 値が存在する項目のみを返すため、`{ ...existingForm, ...mapOrganizationToFormData(org) }`
 * の形でマージすると「マスターに値があれば上書き・なければ既存値を維持」となる。
 */
export function mapOrganizationToFormData(
  org: OrgMasterRecord | null | undefined
): Partial<ApplicationFormData> {
  if (!org) return {};

  const address = [org.prefecture, org.city, org.addressLine].filter(Boolean).join("");
  const businessTypeCode = industryToBusinessTypeCode(org.industry);

  const mapped: Partial<ApplicationFormData> = {
    // 氏名又は名称
    ...(org.nameJa ? { orgName: org.nameJa, employerName: org.nameJa } : {}),
    // 法人番号
    ...(org.corporateNumber ? { orgCorporateNumber: org.corporateNumber } : {}),
    // 住所
    ...(address ? { orgAddress: address, employerAddress: address } : {}),
    // 電話番号
    ...(org.phone ? { orgPhone: org.phone, employerPhone: org.phone } : {}),
    // 業種（BUSINESS_TYPES コードに一致した場合のみ）
    ...(businessTypeCode ? { orgBusinessTypeCode: businessTypeCode } : {}),
    // 資本金又は出資金の額
    ...(org.capital != null ? { orgCapital: String(org.capital) } : {}),
    // 直近の年間売上高
    ...(org.annualSales != null ? { orgAnnualSales: String(org.annualSales) } : {}),
    // 常勤職員数
    ...(org.employeeCount != null ? { orgEmployeeCount: String(org.employeeCount) } : {}),
    // 雇用保険適用事業所番号
    ...(org.employmentInsuranceNo ? { orgEmploymentInsuranceNo: org.employmentInsuranceNo } : {}),
    // 労働保険番号（14桁）
    ...(org.laborInsuranceNo ? { orgLaborInsuranceNo: org.laborInsuranceNo } : {}),
  };

  return mapped;
}

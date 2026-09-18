# 技人国×在留資格変更許可申請 必要書類チェックリスト 設計

## 背景・目的

出入国在留管理庁の技術・人文知識・国際業務（技人国）在留資格変更許可申請について、
既存の「技人国×更新」（`gijinkoku-renewal-checklist.ts`）「家族滞在×COE」
（`kazoku-tairyu-coe-checklist.ts`）と同じ Design B パターン（`document_requirement_master`
テーブル＋条件付き評価ロジック）で、必要書類チェックリストを自動生成する。

在留資格変更許可申請書そのものは対象外（別途管理）とし、一覧には含めない。

## アーキテクチャ

既存の2モジュールと同様、独立した専用モジュールとして新規作成する（既に達成済みの
更新ロジックへ手を入れるリスクを避けるため、共通エンジンへのマージは行わない）。

- `src/lib/gijinkoku-change-of-status-checklist.ts` — 評価ロジック
- `src/components/checklist/gijinkoku-change-of-status-checklist.tsx` — プレビュー/編集UI
- `scripts/seed-gijinkoku-change-of-status.ts` — マスターデータ投入（delete→insert）
- `scripts/test-gijinkoku-change-of-status.ts` — 回帰テスト

`visaType="engineer_humanities"`, `applicationType="change"`（DB enum に既存）。

## データモデル

```typescript
export const GIJINKOKU_CHANGE_VISA_TYPE = "engineer_humanities";
export const GIJINKOKU_CHANGE_APPLICATION_TYPE = "change";
export const TARGET_VISA_LABEL = "技術・人文知識・国際業務";
export const TARGET_PROCEDURE_LABEL = "在留資格変更許可申請";

export type PreparedBy = "applicant" | "organization" | "dispatch_destination" | "agent";

export type DocStatus = "required" | "optional" | "exempt";

export interface ChecklistInput {
  orgCategory: 1 | 2 | 3 | 4;
  eduBackground: "jp_university" | "foreign_university" | "jp_specialized_school" | "work_experience";
  dispatchWork: boolean;
  changeToLanguageWork: boolean;
  photoException: boolean;
}

export interface ChecklistDocument {
  id: string;
  name: string;
  requirement: string;
  preparedBy: PreparedBy;
  conditional: boolean;
  reason?: string;
  status: DocStatus;
  applicable: boolean;
  validityNote?: string;
  translationRequired?: boolean;
}

export interface ConditionMatch {
  orgCategoryIn?: number[];
  eduBackgroundIn?: ChecklistInput["eduBackground"][];
  dispatchWork?: boolean;
  changeToLanguageWork?: boolean;
  photoException?: boolean;
}
```

`conditions`（jsonb）は既存2モジュールと同じ形状（`category?, when?, exemptWhen?,
requirementVariants?, reason?`）に `validityNote?: string`、`translationRequired?: boolean`
を追加する。`exemptWhen` 未設定を「常に一致」と誤判定しないよう、既存モジュールと同じ
`!!c.exemptWhen && matchWhen(...)` パターンを踏襲する。

## 書類カタログ（初期投入セット）

### 共通（常に必要）
- 写真（縦4cm×横3cm）／本人／photoException時は不要
- パスポート及び在留カード（提示）／本人
- 履歴書（職歴を含む）／本人
- 労働条件を明らかにする文書（雇用契約書・労働条件通知書等）／会社
- 事業内容を明らかにする資料（登記事項証明書・会社案内等）／会社／登記事項証明書は発行3ヶ月以内
- 所属機関のカテゴリー該当性を証する文書／会社／カテゴリー1〜4で文言分岐

### 学歴・職歴区分（eduBackground）
- 卒業証明書／jp_university, jp_specialized_school／本人／発行3ヶ月以内
- 学位を証する文書／foreign_university／本人／発行3ヶ月以内・要日本語訳
- 専門士/高度専門士称号を証する書類／jp_specialized_school／本人
- 成績証明書・シラバス等（専攻と職務内容の関連性資料）／jp_university, foreign_university,
  jp_specialized_school／本人／foreign_universityは要日本語訳
- 実務経験証明書（在職期間・業務内容）／work_experience／前職の会社／
  「10年分（言語関連業務は3年分）」、外国発行は要日本語訳

### カテゴリー3・4
- 所属機関の代表者に関する申告書／会社
- 提出書類チェックシート（カテゴリー3・4用）／本人

### 言語関連業務（changeToLanguageWork、カテゴリーを問わず適用）
- CEFR B2相当の言語能力証明書（JLPT N2以上・BJT400点以上等）／本人

### 派遣（dispatchWork）
更新モジュールと同じ7点セット：誓約書（派遣元用/派遣先用）、労働条件通知書又は雇用契約書、
労働者派遣個別契約書、派遣元管理台帳、派遣先管理台帳、就業状況報告書

### 任意・推奨
- 理由書／行政書士

## アラート表示

`validityNote`/`translationRequired` を画面上でバッジ表示（例:「⚠️発行3ヶ月以内」
「要日本語訳」）。印刷一覧表の備考欄にも同じ注記を出力する。

## チェックボックスの役割（既存方針を踏襲）

印刷・一覧表には該当する必要書類をすべて表示する
（`selectApplicableChecklistDocumentsForPrint` を再利用）。チェックボックスは
案件への「反映」対象を選ぶためのものであり、印刷対象の絞り込みには使わない。

## テスト計画

`eduBackground × orgCategory × dispatchWork × changeToLanguageWork` の代表的な
組み合わせを検証する。既存2モジュールと同水準の網羅性（各分岐・除外条件・
exemptWhen回帰テストを含む）を確保する。

## 既知の前提・限界

書類カタログは出入国在留管理庁の一般的な運用に基づく想定であり、実務経験年数
（3年/10年）の具体的な適用条件や正式な書類名称は、投入後に `/document-master`
画面から調整可能（Design B のためコード変更不要）。

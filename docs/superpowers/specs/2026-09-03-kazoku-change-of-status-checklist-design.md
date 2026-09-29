# 家族滞在×在留資格変更許可申請 必要書類チェックリスト 設計

## 背景・目的

出入国在留管理庁の家族滞在（就労資格・居住資格等で日本に在留する方に扶養される、
既に日本に在留している配偶者又は子）の在留資格変更許可申請について、既存の
「家族滞在×COE」（`kazoku-tairyu-coe-checklist.ts`）「技人国×更新」
「技人国×変更」と同じ Design B パターンで、必要書類チェックリストを自動生成する。

在留資格変更許可申請書そのものは対象外（別途管理）とし、一覧には含めない。

参照: https://www.moj.go.jp/isa/applications/status/dependent.html

## アーキテクチャ

独立モジュールとして新規作成する（既存4モジュールと同じ方針）。

- `src/lib/kazoku-change-of-status-checklist.ts` — 評価ロジック
- `src/app/(dashboard)/document-master/kazoku-change-conditions-editor.tsx` — 条件エディタ
- `src/components/checklist/kazoku-change-of-status-checklist.tsx` — プレビュー/編集UI
- `scripts/seed-kazoku-change-of-status.ts` — マスターデータ投入（delete→insert）
- `scripts/test-kazoku-change-of-status.ts` — 回帰テスト

`visaType="dependent"`, `applicationType="change"`（DB enum に既存）。

## データモデル（家族滞在×COEとの差分）

```typescript
export const KAZOKU_CHANGE_VISA_TYPE = "dependent";
export const KAZOKU_CHANGE_APPLICATION_TYPE = "change";
export const TARGET_VISA_LABEL = "家族滞在";
export const TARGET_PROCEDURE_LABEL = "在留資格変更許可申請";

export type Relationship = "spouse" | "child";
export type SupporterIncomeType = "income" | "other";

export type IdentityDocKey =
  | "family_register" | "marriage_certificate_receipt" | "marriage_certificate"
  | "birth_certificate" | "acknowledgment_certificate" | "equivalent_document";
// COEモジュールに "acknowledgment_certificate"（認知届の写し・子の場合）を追加

export type FinancialProofKey = "bank_balance" | "scholarship" | "other_financial";

export type PreparedBy = "applicant" | "supporter" | "agent";
export type DocStatus = "required" | "exempt" | "optional";

export interface ChecklistInput {
  relationship: Relationship;
  supporterIncomeType: SupporterIncomeType;
  identityDocs: IdentityDocKey[];
  financialProofDocs: FinancialProofKey[];
  photoException: boolean;
}
// COEモジュールの attachApplicantPassportCopy は削除（変更申請では申請人は
// 既に在留カードを提示するため、COE時点の「任意でパスポート写し添付」は不要）

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
  /** 新規: マイナンバーの記載がないものを求める場合 true */
  myNumberExcluded?: boolean;
}
```

`conditions`（jsonb）は `{ category?, when?, exemptWhen?, optional?, requirementVariants?,
reason?, validityNote?, translationRequired?, myNumberExcluded? }`。既存モジュールと同じ
`!!c.exemptWhen && matchWhen(...)` パターンを踏襲する。

## 書類カタログ（初期投入セット）

### 共通（常に必要）
- 写真（縦4cm×横3cm）／申請人／photoException時は不要
- パスポート及び在留カード（提示）／申請人
- 世帯全員の住民票の写し／申請人／マイナンバー省略・発行3ヶ月以内
- 扶養者のパスポート及び在留カードの写し／扶養者

### 身分関係（relationship）
- 配偶者: 結婚証明書／婚姻届受理証明書／戸籍謄本／その他準ずる文書（外国語は要日本語訳）
- 子: 出生証明書／認知届の写し／その他準ずる文書（外国語は要日本語訳）

### 扶養者の収入状況（supporterIncomeType）
- income: 在職証明書又は営業許可書の写し等／住民税課税証明書（発行3ヶ月以内）／住民税納税証明書（発行3ヶ月以内）
- other: 預金残高証明書／奨学金給付証明書／その他資力を証する資料

### 任意・推奨
- 理由書（同居・扶養状況・変更に至る経緯の説明）／行政書士

## アラート表示

`validityNote`/`translationRequired`/`myNumberExcluded` を画面上でバッジ表示
（例:「⚠️発行3ヶ月以内」「要日本語訳」「マイナンバー省略」）。印刷一覧表の
備考欄にも同じ注記を出力する。

## チェックボックスの役割・バリデーション

印刷・一覧表には該当する必要書類をすべて表示する。チェックボックスは案件への
「反映」対象を選ぶためのもの（既存3機能と同じ方針）。`validateInput()` で
身分関係書類・資力証明の未選択警告をCOEモジュールと同様に実装する。

## 既知の前提・限界

書類カタログは出入国在留管理庁の一般的な運用に基づく想定であり、投入後に
`/document-master` 画面から調整可能（Design B のためコード変更不要）。

# 定住者COE（区分T）申請書作成 — フィールド拡張設計

## 背景

出入国在留管理庁オンライン申請システムの実際の提出控え（在留資格認定証明書交付申請・区分T・
定住者、対象事例:「永住者・特別永住者」の「未成年で未婚の実子」）を基に、システムの
申請書作成機能（`ApplicationFormData` / `shinsei-form-editor.tsx` / 印刷ページ / RASENS転記
シート）が区分T・定住者の全項目をカバーできるよう拡張する。

対象事例は配偶者ではなく「永住者の実子」ケースであり、既存のT型ブロック（配偶者情報のみ）
に加えて、家族滞在（R型）が持つ扶養者・出生届出・滞在費支弁の仕組みを流用する必要がある。

## 既存流用（新規フィールド不要）

- 出生届/婚姻届の届出先・年月日: R型の `marriageNotificationPlaceJapan/DateJapan/PlaceForeign/DateForeign`
- 扶養者情報: R型の `supporterXxx`（12項目）
- 滞在費支弁方法の基本区分: `fundingMethod`/`fundingMethodOther`
- 法定代理人・取次者: 既存の `representativeXxx`/`agentXxx`（全カテゴリ共通で表示済み）

## 新規フィールド（`ApplicationFormData` に追加、21項目）

```typescript
// 身分又は地位（T型固有）
statusOrPosition: string;

// 申請人の勤務先等（年収のみ新規、名称等は employerXxx を流用）
applicantAnnualIncome: string;

// 滞在費支弁方法（詳細）
fundingMonthlyAmount: string;
fundingRemittanceType: string;
fundingRemittanceAmount: string;

// 経費支弁者
expensePayerName: string;
expensePayerNationality: string;
expensePayerAddress: string;
expensePayerPhone: string;
expensePayerOccupation: string;
expensePayerWorkPhone: string;
expensePayerAnnualIncome: string;

// 身元保証人又は連絡先
guarantorName: string;
guarantorOccupation: string;
guarantorAddress: string;
guarantorPhone: string;
guarantorCellular: string;

// 受領方法等（COE申請全般）
coeReceiptMethod: string;
notificationEmail: string;
notificationEmailConfirm: string;
portalPhotoFileName: string;
portalAttachmentFileName: string;
```

## 実装箇所

1. **`src/lib/form-types.ts`** — 上記フィールドの型定義追加 + `EMPTY_FORM_DATA` 初期値。
   DBスキーマ変更不要（`applications.formData` は単一jsonbカラム）。
2. **`shinsei-form-editor.tsx`** — T型ブロックに「身分又は地位」「申請人の勤務先等」
   「経費支弁者」「身元保証人」カードを新設。既存の「婚姻・出生届出」「滞在費支弁方法」
   「扶養者情報」カードの表示条件を `isRtype` → `isRtype || isTtype` に変更。
   「受領方法等」は `isCoe` で表示（カテゴリ非依存）。
3. **`shinsei-applicant/page.tsx`** — T型印刷ブロック（324-384行目）を同様に拡張。
4. **`rasens-transfer.ts`** — T型セクション（226行目〜）に新規フィールドのラベル・値
   マッピングを追加し、オンライン申請システムへの転記シートを定住者COEに対応させる。

## 既知の前提・限界

このデータは出入国在留管理庁オンライン申請システムへの「転記用」であり、本システムから
政府ポータルへの自動送信は行わない（既存のRASENS転記シートの仕組みを踏襲）。

# 扶養者の申請人マスター登録・連携 設計書

- 作成日: 2026-06-24
- 対象: 在留申請システム（zairyu-shinsei-system）
- ブランチ: feature/pdf-split-and-org-master

## 背景・目的

R型（家族滞在）申請の「扶養者」情報は、現在`ApplicationFormData`内の23個の自由入力テキスト項目（`supporterNameEn`等）として申請ごとに個別入力されており、マスター化・他申請での再利用が一切できない。

一方、扶養者は実在する一人の人物であり、別の申請では「申請人」本人になることもある（例: 扶養者として登録された配偶者が、後日自身の在留資格更新申請を行うケース）。この実態を反映し、扶養者を既存の「申請人マスター」（`applicantMaster`）に登録・再利用できるようにする。

## 対象の人物像

`applicantMaster`は既に「日本に在留する（または在留しようとする）人物」を表す汎用的なマスターであり、氏名・国籍・在留資格・在留カード番号等、扶養者の本人情報としても適切な項目を持つ。新しい「扶養者マスター」テーブルは作らず、`applicantMaster`をそのまま共用する。

## データモデル

- `applications`テーブルに新規カラム`supporterId`（`uuid`、`applicantMaster.id`を参照、NULL許容）を追加する。
- `applicantId`/`organizationId`と異なり、`supporterId`は申請作成後にも変更可能とする（扶養者はR型を選択した後の編集中に決まることが多いため）。
- 既存の23個の`supporterXxx`自由入力フォーム項目は構造変更せず、すべて維持する。

## サーバーアクション

- **新規登録**: 既存の`createApplicant`（`src/actions/applicants.ts`）をそのまま再利用する（必須項目`familyNameEn`/`givenNameEn`/`nationality`以外は全て任意項目のため、扶養者用の簡易フォームからもそのまま呼び出せる）。
- **紐付け更新**: 新規アクション`setApplicationSupporter(applicationId: string, supporterId: string | null): Promise<{success: boolean; error?: string}>`を追加する。`saveApplicationFormData`はフォーム本文（JSONB）のみを更新するため、`applications.supporterId`カラムの更新はこの専用アクションで行う。監査ログ（`auditLog`）への記録も他の更新系アクションと同様に行う。
- **一覧取得**: 申請人マスターの一覧（ドロップダウン用、`{id, familyNameEn, givenNameEn, nationality}`）を取得する既存のアクション（`/applicants`一覧ページが使っているもの）を再利用する。

## UI/UX

### 申請書編集画面（扶養者セクション）

既存の自由入力23項目セクションの先頭に以下を追加する：

```
扶養者
[既存から選択 ▼] [＋ 新規登録]
  └ 「＋ 新規登録」クリックで簡易フォームが展開
    （氏名英語・氏名日本語・国籍・生年月日・性別・
      在留カード番号・在留資格・在留期限・住所）
```

- ドロップダウンの選択肢は申請人マスター一覧から取得し、**この申請の申請人本人は除外**する（自分自身を扶養者にはできない）。
- 既存選択・新規登録のいずれの場合も、選択/作成した人物のマスター値を以下11項目に自動反映する（反映後は通常のテキスト入力として上書き編集可能）：
  - `supporterNameEn`/`supporterFamilyNameEn`/`supporterGivenNameEn` ← `familyNameEn`/`givenNameEn`
  - `supporterFamilyNameJa`/`supporterGivenNameJa` ← `familyNameJa`/`givenNameJa`
  - `supporterDob` ← `dateOfBirth`
  - `supporterNationality` ← `nationality`
  - `supporterAddress` ← `japanAddress`（prefecture/city/line結合済みの値）
  - `supporterResidenceCard` ← `residenceCardNumber`
  - `supporterStatusOfResidence` ← `currentVisaType`（`VISA_TYPE_LABELS`で日本語ラベルに変換、既存の`buildEffectiveFormData`と同じ変換ロジックを使う）
  - `supporterPeriodExpiry` ← `currentVisaExpiry`
- マスターに存在しない以下9項目は自由入力のまま変更しない：`supporterPeriodOfStay`、`supporterRelationship`、`supporterRelationshipOther`、`supporterEmployer`、`supporterCorporateNumber`、`supporterBranchName`、`supporterEmployerAddress`、`supporterEmployerPhone`、`supporterAnnualIncome`。
- ドロップダウンで人物を選択/新規作成した時点で`setApplicationSupporter`を呼び出し、`applications.supporterId`を即時更新する（通常のフォーム保存ボタンとは独立した即時保存）。
- ドロップダウンを「選択してください」に戻した場合は`supporterId`をNULLに更新するが、既に自動反映されたテキスト項目の値はそのまま残す（データ消失を避ける）。

### 申請人マスター詳細ページ（`/applicants/[id]`）

既存の「関連する申請（申請人として）」一覧の下に、新しい一覧セクション「扶養者として紐付けられている申請」を追加する。`applications.supporterId === id`で絞り込み、既存の関連申請一覧と同じ表示形式（案件番号・種別・状態・更新日時）を使う。

## 影響範囲・スコープ外

- 既存の23個の`supporterXxx`自由入力項目の構造・PDF出力ロジック（`shinsei-org.tsx`のR型扶養者用ページ）は変更しない。PDFは常に`form.supporterXxx`の値を読むため、値の出どころ（マスター由来か手入力か）に関わらずそのまま動作する。
- `applicantId`/`organizationId`の既存の「作成時のみ設定・以降不変」という仕様は変更しない。新設する`supporterId`のみ、編集中に変更可能な別仕様とする。
- 既存の申請（`supporterId`が常にNULL）はそのまま自由入力テキストとして動作し続ける。マイグレーションでのバックフィルは行わない。
- 扶養者自身の勤務先・年収情報を、扶養者が紐づく別の所属機関マスターから自動反映する機能は今回追加しない（マスターにこれらの項目がそもそも存在しないため）。

## テスト手順

1. R型の申請を開き、扶養者セクションのドロップダウンで既存の申請人マスターを選択すると、氏名・生年月日・国籍・住所・在留カード番号・在留資格・在留期限の8系統（11項目）が自動反映されることを確認する。
2. 自動反映された項目を手動で上書き編集し、保存後に再読み込みしても編集後の値が保持されることを確認する（マスターの値に戻らないこと）。
3. 「＋ 新規登録」から簡易フォームで新規人物を作成し、同様に自動反映されることを確認する。作成後、`/applicants`一覧にその人物が新規の申請人マスターとして表示されることを確認する。
4. ドロップダウンの選択肢に、この申請の申請人本人が含まれていないことを確認する。
5. 扶養者として選択した人物の`/applicants/[id]`詳細ページを開き、「扶養者として紐付けられている申請」一覧にこの申請が表示されることを確認する。
6. ドロップダウンを「選択してください」に戻し、既に入力されていたテキスト項目の値が消えないことを確認する。
7. `supporterId`がNULLの既存申請（マイグレーション前のデータ）を開き、従来通り自由入力のテキストがそのまま表示・編集できることを確認する（回帰確認）。
8. R型以外の申請で、画面・PDF出力に変化がないことを確認する。
9. `npx tsc --noEmit`・`npm run build`でエラーがないことを確認する。

# 質問書・顧客聴取機能 — 動的差分生成＋AI拡張 設計書

- 作成日: 2026-06-19
- 対象: 在留申請システム（zairyu-shinsei-system）
- ブランチ: feature/pdf-split-and-org-master

## 背景・目的

現在「質問書・顧客聴取」機能は2つの独立した系統に分かれている。

1. **静的印刷系統**（`questionnaire-questions.ts` の `ALL_QUESTIONS` + `getEmptyQuestions`）
   - `print/[id]/questionnaire`、`questionnaire-content/route.ts`、`questionnaire-docx-button.tsx` が使用
   - `application.formData` の生値のみを見て空欄を検出（マスター由来の既知情報を誤って「空欄」と判定するバグがある）
   - 印刷・DOCX出力専用で、画面上の対話入力はない

2. **対話UI系統**（`questionnaire-panel.tsx` + `questionnaireQuestions` テーブル）
   - 質問生成は `draftData`（古い下書き要約）への一回限りのGemini呼び出し（`generateQuestionnaire`）
   - 回答保存後、`applyQuestionnaireToDraft` で `draftData.additionalNotes` に非構造化テキストとして追記されるのみで、実際の申請書フィールドやマスターには反映されない

この2系統を1つの統合差分エンジンに置き換え、「申請書データ」「必要書類チェックリスト」「在留資格別の必須確認事項」から自動的に不足情報を検出し、回答が直接申請書フィールド・チェックリストに書き込まれる（自動逆流する）システムを構築する。さらに、ルールベースの検出を補完する形でAI（Gemini）による論理矛盾検出を追加する。

## アーキテクチャ概要

質問は永続化せず、ページを開くたびに以下の3軸から毎回ライブ計算する。回答はその場で本来のフィールド（`application.formData` または `checklist.expertNotes`）に直接書き込まれるため、「すでに分かっている情報は自動的に質問から消える」が自然に実現される。

```
ページレンダリング時:
  effectiveForm = buildEffectiveFormData(application, applicant, organization)
       ↓
  computeInterviewQuestions(effectiveForm, formType, category, checklist)
       ├─ セクションA: 全カテゴリ共通の空欄・必須確認項目（categories制約なしの項目）
       └─ セクションB: 資格別の空欄・必須確認項目（categories制約ありの項目）
       ↓
  QuestionnairePanel に渡す（A/Bは即時表示）
       ↓
  スタッフが「AIで分析」ボタンを押すと:
       analyzeInterviewWithAI(applicationId) → Gemini 2.5 Flash
       ↓
       セクションC: AI検出事項（論理矛盾等、A/Bと重複しないものだけ）
       ↓
  回答保存 → saveInterviewAnswer() → formData or expertNotes へ直接書込み → revalidatePath → 再計算で解決済み項目が自動的に消える
```

## セクションA/B/Cモデル

| セクション | 内容 | 生成方法 | 表示タイミング |
|---|---|---|---|
| A | 全カテゴリ共通必須確認事項（犯罪歴・同居者・婚姻状況など、`categories`制約なしの項目） | ルールベース | 即時 |
| B | 資格別基本質問（`categories`制約あり。新規3項目もここに含む） | ルールベース | 即時 |
| C | AI検出事項（論理矛盾・潜在的な不整合） | Gemini 2.5 Flash | 「AIで分析」ボタン押下後のみ |

`QQuestion.categories` の有無で A/B を振り分ける（なし→A、あり→B）。

## 新規・変更ファイル一覧

| ファイル | 種別 | 内容 |
|---|---|---|
| `src/lib/form-types.ts` | 変更 | 新フィールド6件追加: `disciplinaryActionExists/Detail`, `doubleContractExists/Detail`, `taxInsuranceArrearsExists/Detail` |
| `src/lib/questionnaire-questions.ts` | 変更 | `ALL_QUESTIONS` に上記6フィールド（`*Exists` 3件 + `*Detail` 3件）を `categories: ["V","N"]` で追加。`*Detail` は既存の `criminalRecordDetail`（`condition: (f) => f.criminalRecord === "有"`）と同じパターンで、対応する `*Exists` が `"有"` の場合のみ質問として出現させる。`isEmpty`/`toFormType`/`getEmptyQuestions` は既存ロジックを再利用 |
| `src/lib/effective-form-data.ts` | 新規 | `shinsei-form/page.tsx` の「savedForm ?? masterData + マスター上書き」ロジックを `buildEffectiveFormData(application, applicant, organization)` として抽出・共通化。静的印刷系統がマスター由来の既知情報を誤って空欄判定していたバグも解消 |
| `src/lib/document-interview-checks.ts` | 新規 | ③書類突合質問の定義テーブル。初期実装：住民票（世帯全員記載確認）、課税証明書（未納額確認）の2件。`documentName` への部分一致 + マーカー文字列で「回答済み」を判定 |
| `src/lib/interview-diff.ts` | 新規 | 統合差分エンジン `computeInterviewQuestions()`。A/B/書類質問を統合し、`bucket: 'A'\|'B'` を付与して返す |
| `src/actions/interview.ts` | 新規 | `saveInterviewAnswer()` — `kind:"form"` は `application.formData` を更新、`kind:"checklist"` は該当 `checklist.expertNotes` に追記 |
| `src/actions/interview-ai-analysis.ts` | 新規 | `analyzeInterviewWithAI(applicationId)` — システムプロンプトを埋め込み、`effectiveForm` をJSON化してGemini 2.5 Flashに投入。レスポンスのパース・検証・重複除去 |
| `src/components/applications/questionnaire-panel.tsx` | 書き換え | A/B/Cのセクション分けUI、選択肢ベースの回答入力、「AIで分析」ボタン、ローディング状態 |
| `src/app/(dashboard)/applications/[id]/page.tsx` | 変更 | `questionnaireQuestions` テーブル参照を削除し、`computeInterviewQuestions` の結果を渡す |
| `src/components/applications/workflow-stepper.tsx` | 変更 | `generateQuestionnaire` のAI呼び出しを削除 |
| `src/app/api/applications/[id]/questionnaire-content/route.ts`<br>`src/app/print/[id]/questionnaire/page.tsx`<br>`src/app/api/applications/[id]/questionnaire-gdoc/route.ts` | 変更 | 質問取得を `getEmptyQuestions` 直呼びから `computeInterviewQuestions`（A/B部分のみ、Cは含めない）経由に変更 |
| `src/actions/applications.ts` | 変更 | `generateQuestionnaire`/`updateQuestionnaireAnswer`/`applyQuestionnaireToDraft` を削除 |
| DBマイグレーション | 変更 | `questionnaire_questions` テーブルを削除（既存データのバックアップ確認後に削除。前例: `workers_accident_insurance_no` カラム削除と同手順） |

## データフロー詳細

### ①②（セクションA/B、同一ロジック）
`getEmptyQuestions(effectiveForm, formType, category)` が `ApplicationFormData` の空欄を検出。新規6フィールドも通常の項目と同じ扱いになるため追加ロジック不要。`categories` の有無でA/Bに振り分ける。

### ③（書類突合質問）
`checklist` を走査し、`documentName` に「住民票」「課税証明書」を含む項目で、ファイル提出済み（`fileUrl` あり or `status === "submitted"`）かつ `expertNotes` にマーカー文字列（例: `[顧客聴取] 世帯全員の記載`）が未含有のものを質問化。

### AI分析（セクションC）
1. スタッフが「AIで分析」ボタンを押すと `analyzeInterviewWithAI(applicationId)` を呼び出す
2. `application.formData` が `null` または空オブジェクトの場合、Geminiを呼ばずに即座に `{success:true, questions:[], skipped:true}` を返す（クラッシュ安全性、要件1）
3. `effectiveForm` をJSON化し、以下のシステムプロンプトとともにGemini 2.5 Flashへ送信:

```text
あなたは入管申請（在留資格手続き）の専門家および優秀なヒアリングアシスタントです。
提供された「現在作成中の申請書データ（JSON）」を厳密に分析し、以下の指示に従って顧客向けの質問リストをJSON形式で出力してください。

1. データの分析:
   - 値が空欄（null, "", 未定義）になっている項目をすべてリストアップしてください。
   - すでに値が入っている項目でも、前後の論理的矛盾（例：既婚となっているが配偶者情報が空、など）がある項目を特定してください。
2. 質問文への変換:
   - テクニカルな変数名を、顧客が直感的に理解できる親切で分かりやすい日本語の質問文に変換してください。
3. 出力フォーマット:
   - 必ず以下の構造のプレーンなJSON配列で返却してください。
     [
       { "field": "変数名", "question": "分かりやすい質問文", "category": "C" }
     ]
```

4. レスポンスをJSON抽出・パース（既存 `generateQuestionnaire` と同じ ```json フェンス or 配列正規表現抽出パターン）
5. 各要素の `field` が `ApplicationFormData` の実在キーかどうかを `EMPTY_FORM_DATA` のキー集合で検証。不明なキーは破棄（ハルシネーション対策）
6. セクションA/Bで既に出ている `field` と重複するものは除去（AIの価値を「矛盾検出」に限定し、冗長な空欄列挙を防ぐ）
7. 最大15件にキャップ
8. Gemini呼び出し失敗・JSON解析失敗・`GEMINI_API_KEY` 未設定の場合は例外を握り `{success:true, questions:[]}` を返す（UIはクラッシュせず「AI分析を実行できませんでした」等の軽量な通知のみ）

### 回答保存
- `kind:"form"`: `application.formData` へ `{[formKey]: value}` をマージして保存
- `kind:"checklist"`: 該当 `applicationDocumentChecklist.expertNotes` に `[顧客聴取] ラベル: 値（聴取日: YYYY-MM-DD）` 形式で追記
- 保存後 `revalidatePath` + 画面リロードにより、次回計算時に値が埋まっているため該当質問は自動的にリストから消える

## エラーハンドリング

- `saveInterviewAnswer` / `analyzeInterviewWithAI` は既存の `auth()` + `tenantId` 検証パターンを踏襲し、DB書込み・API呼び出しをtry/catchで包んで `{success:false, error}` を返す
- `effectiveForm` が `visaFormCategory`/`applicationFormType` 欠損時は既存の `toFormType` 同様にデフォルトへフォールバック
- AI分析: データなし・API未設定・呼び出し失敗・パース失敗の全パターンで例外を投げず、空配列で安全にフォールバック（要件1の中核）

## テスト手順

1. V または N カテゴリの案件で、`ApplicationFormData` に空欄がある状態＋チェックリストに「住民票」「課税証明書」を提出済みで用意
2. 「質問書・顧客聴取」パネルを開き、セクションA（空欄＋共通必須確認）、セクションB（資格別空欄＋新規3項目）、書類確認2項目が即時表示されることを確認
3. **クラッシュ安全性確認**: `application.formData` が未保存（null）の新規案件でパネルを開き、A/Bのみが美しく表示され、エラーが出ないことを確認
4. 「AIで分析」ボタンを押し、セクションCにAI検出事項（論理矛盾等、A/Bと重複しないもの）が表示されることを確認
5. `application.formData` がnullの状態で「AIで分析」を押し、Geminiを呼ばずに安全にスキップされる（エラーにならない）ことを確認
6. いくつか回答して保存（例：職業を入力、二重契約=無、住民票確認=有）
7. リロード後、回答済み項目がパネルから消えていることを確認。「申請書作成」画面で該当フィールドが自動入力されていること、チェックリストの該当項目`expertNotes`に確認文言が追記されていることを確認
8. 印刷ページ（`/print/[id]/questionnaire`）・DOCX出力でも同じ縮小済みA/Bリストが反映されることを確認（Cは印刷に含めない）
9. `npm run build` でTypeScriptエラーなしを確認

## スコープ外（将来拡張）

- V（特定技能）固有の追加確認項目（今回は追加しない。共通3項目をV/N両カテゴリに適用するのみ）
- ③書類突合質問の対象拡大（雇用契約書・身元保証書・在留カードコピー等）
- 他の在留資格カテゴリ（M/L/I/J/K/O/P/Q/R/T/Y/H/U）への必須確認事項拡張

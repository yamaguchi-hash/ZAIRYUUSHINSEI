# 所属機関用・申請人用PDFのコンテンツ完全化（Phase 2） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `shinsei-applicant.tsx`・`shinsei-org.tsx`が、現在V型（特定技能）専用または共通部分のみしか出力していないN型・T型・R型・P型のコンテンツを、`shinsei.tsx`（一括版、削除予定だが現時点ではまだ存在し、移植元として参照する）から移植し、全カテゴリで`shinsei.tsx`と同等の内容を出力できるようにする。また、`shinsei.tsx`に埋め込まれている資格外活動許可申請書を独立ルートとして切り出す。

**Architecture:** `shinsei-applicant.tsx`にはN/T/R/P型それぞれ専用の追加ページ（既存のV型ページと同じ`<div className="page">`＋`FormHeader`パターン）を新設する。`shinsei-org.tsx`にはN型・扶養者用（R型）の追加ページと、その他就労系区分用のフリーフィールドページを新設する。各ページの末尾の署名欄は、既存の`SignatureSection`コンポーネント（`role="applicant"`は「申請人（法定代理人）の署名」を含み、`role="supporter"`は「扶養者の署名」を含む——いずれも移植元の手書きテーブルと同等の文言を持つ既存コンポーネント）に統一し、手書きテーブルの再実装は行わない。資格外活動許可申請書は`riyusho.tsx`・`noufusho.tsx`と同じ構造パターンに従う新規ルートとして切り出す。

**Tech Stack:** Next.js 16 App Router、TypeScript。自動テストフレームワークは未導入のため、検証は`npx tsc --noEmit`＋`npm run build`＋ブラウザでの手動確認で行う。

**重要な原則（全タスク共通）:**
- 移植元`src/app/(print)/print/[id]/shinsei/page.tsx`の該当行は、各タスクで指定する行番号をその都度`Read`ツールで読み直し、**テーブル構造・CSSクラス・data-bindingを一切変更せず一字一句そのまま**移植先に貼り付けること。行番号は本計画作成時点のものであり、前のタスクでの編集により多少前後する可能性があるため、貼り付け前に対象ブロックの内容（見出しのコメント文字列等）を確認すること。
- 既存の`FormHeader`呼び出しパターン（2ページ目以降は`partLabel`/`partLabelV`/`partLabelEn`のみを渡し、`showGov`/`formNumber`/`title`/`titleEn`は渡さない）を新規ページにもそのまま適用する。
- 手書き署名テーブルは全て`<SignatureSection role="applicant" />`または`<SignatureSection role="supporter" />`に置き換える（既存の`SIGNATURE_META`に同等の文言が既に定義されているため、内容の欠落は生じない）。

参考設計書: [docs/superpowers/specs/2026-06-24-shinsei-pdf-consolidation-and-margin-fix-design.md](../specs/2026-06-24-shinsei-pdf-consolidation-and-margin-fix-design.md)（Phase 2部分）

---

### Task 1: shinsei-applicant.tsx に N型・T型・P型のPart2ページを追加

**Files:**
- Modify: `src/app/(print)/print/[id]/shinsei-applicant/page.tsx`

- [ ] **Step 1: 移植元の内容を確認する**

`src/app/(print)/print/[id]/shinsei/page.tsx`の以下の行を`Read`で読む：
- 437〜501行目（N型 Part2、見出しコメント「N型 Part 2」付近）
- 502〜557行目（T型 Part2、見出しコメント「T型 Part 2」付近）
- 831〜871行目（P型 Part2、見出しコメント「P型 Part 2（留学：学校情報）」付近）

これらのブロックの内側のテーブル・項目（`form.xxx`のフィールド参照）をそのまま使う。

- [ ] **Step 2: Page1の末尾の署名欄の条件を変更する**

`src/app/(print)/print/[id]/shinsei-applicant/page.tsx`の233行目を変更する。

変更前:
```tsx
          {/* ── 【申請人署名欄】（V型以外はPage1で完結するためここに配置） ── */}
          {!isVtype && <SignatureSection role="applicant" />}
        </div>
```

変更後:
```tsx
          {/* ── 【申請人署名欄】（Part2を持たない区分のみPage1で完結するためここに配置） ── */}
          {!isVtype && !isNtype && !isTtype && !isRtype && !isPtype && <SignatureSection role="applicant" />}
        </div>
```

- [ ] **Step 3: `data`の分割代入にN/T/R/P型の判定変数を追加する**

29行目を変更する。

変更前:
```tsx
  const { app, applicant, org, form, familyMembers, workHistory, today, isChange, formType, cat, isVtype } = data;
```

変更後:
```tsx
  const { app, applicant, org, form, familyMembers, workHistory, today, isChange, formType, cat, isVtype } = data;
  const isNtype = ['N', 'L', 'I'].includes(cat);
  const isTtype = cat === 'T';
  const isRtype = cat === 'R';
  const isPtype = cat === 'P';
```

（`loadShinseiData`が返す`data`オブジェクトに`isNtype`等が含まれていない場合にこの方式で定義する。既に含まれている場合は、Step 1で確認した`shinsei.tsx`側の定義と一致することを確認し、このStepは不要。`shinsei-org.tsx`でも同様の判定が必要になるため、可能であれば`loadShinseiData`（`shinsei-shared.tsx`）に判定ロジックを集約することが望ましいが、今回は既存の`shinsei.tsx`にある判定方法を各ファイルでそのまま再現する形で進め、将来的なリファクタリングは別タスクとする。）

- [ ] **Step 4: N型・T型・P型の新規ページを、V型ページの直前に追加する**

`src/app/(print)/print/[id]/shinsei-applicant/page.tsx`の236行目（`{/* ══...Page 2〜3: 特定技能（V型）専用ページ... */}`のコメント直前）に、以下の3つの新規ブロックを追加する。

```tsx
        {/* ══════════════════════════════════════════════════════════════════════
            Page 2: N型専用ページ（技術・人文知識・国際業務 等）
            ════════════════════════════════════════════════════════════════════ */}
        {isNtype && (
        <div className="page">
          <FormHeader
            partLabel="申請人等作成用　２"
            partLabelEn="For applicant, Part 2"
          />

          {/* ここに shinsei/page.tsx の437〜501行目（N型 Part2）の内容をそのまま貼り付ける */}

          {/* ── 取次者 ── */}
          <div className="item-title" style={{ marginTop: "10px" }}>
            ※ 取次者
            <span className="bilingual">　Agent or other authorized person</span>
          </div>
          <table style={{ fontSize: "9px" }}><tbody>
            <tr>
              <td className="lbl" style={{ width: "20%" }}>(1) 氏名<br /><span className="bilingual">Name</span></td>
              <td style={{ width: "30%" }}>山口忠士</td>
              <td className="lbl" style={{ width: "20%" }}>(2) 住所<br /><span className="bilingual">Address</span></td>
              <td style={{ width: "30%" }}>〒665-0864 兵庫県宝塚市泉町22-25 島上マンション南棟1-B</td>
            </tr>
            <tr>
              <td className="lbl">(3) 所属機関等<br /><span className="bilingual">Organization</span></td>
              <td>兵庫県行政書士会</td>
              <td className="lbl">電話番号<br /><span className="bilingual">Telephone No.</span></td>
              <td>090-2596-0128</td>
            </tr>
          </tbody></table>

          <SignatureSection role="applicant" />
        </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            Page 2: T型専用ページ（日本人の配偶者等 等）
            ════════════════════════════════════════════════════════════════════ */}
        {isTtype && (
        <div className="page">
          <FormHeader
            partLabel="申請人等作成用　２"
            partLabelEn="For applicant, Part 2"
          />

          {/* ここに shinsei/page.tsx の502〜557行目（T型 Part2）の内容をそのまま貼り付ける */}

          {/* ── 取次者 ── */}
          <div className="item-title" style={{ marginTop: "10px" }}>
            ※ 取次者
            <span className="bilingual">　Agent or other authorized person</span>
          </div>
          <table style={{ fontSize: "9px" }}><tbody>
            <tr>
              <td className="lbl" style={{ width: "20%" }}>(1) 氏名<br /><span className="bilingual">Name</span></td>
              <td style={{ width: "30%" }}>山口忠士</td>
              <td className="lbl" style={{ width: "20%" }}>(2) 住所<br /><span className="bilingual">Address</span></td>
              <td style={{ width: "30%" }}>〒665-0864 兵庫県宝塚市泉町22-25 島上マンション南棟1-B</td>
            </tr>
            <tr>
              <td className="lbl">(3) 所属機関等<br /><span className="bilingual">Organization</span></td>
              <td>兵庫県行政書士会</td>
              <td className="lbl">電話番号<br /><span className="bilingual">Telephone No.</span></td>
              <td>090-2596-0128</td>
            </tr>
          </tbody></table>

          <SignatureSection role="applicant" />
        </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            Page 2: P型専用ページ（留学）
            ════════════════════════════════════════════════════════════════════ */}
        {isPtype && (
        <div className="page">
          <FormHeader
            partLabel="申請人等作成用　２"
            partLabelEn="For applicant, Part 2"
          />

          {/* ここに shinsei/page.tsx の831〜871行目（P型 Part2）の内容をそのまま貼り付ける。
              ただし外側の {isPtype && (<>...</>)} は不要（このブロック自体が既にisPtypeで
              ガードされているため）。内側の <div className="section">...</div> から
              費用支弁方法のテーブルまでをそのまま使う。 */}

          {/* ── 取次者 ── */}
          <div className="item-title" style={{ marginTop: "10px" }}>
            ※ 取次者
            <span className="bilingual">　Agent or other authorized person</span>
          </div>
          <table style={{ fontSize: "9px" }}><tbody>
            <tr>
              <td className="lbl" style={{ width: "20%" }}>(1) 氏名<br /><span className="bilingual">Name</span></td>
              <td style={{ width: "30%" }}>山口忠士</td>
              <td className="lbl" style={{ width: "20%" }}>(2) 住所<br /><span className="bilingual">Address</span></td>
              <td style={{ width: "30%" }}>〒665-0864 兵庫県宝塚市泉町22-25 島上マンション南棟1-B</td>
            </tr>
            <tr>
              <td className="lbl">(3) 所属機関等<br /><span className="bilingual">Organization</span></td>
              <td>兵庫県行政書士会</td>
              <td className="lbl">電話番号<br /><span className="bilingual">Telephone No.</span></td>
              <td>090-2596-0128</td>
            </tr>
          </tbody></table>

          <SignatureSection role="applicant" />
        </div>
        )}

```

N型・T型・P型のブロック内の「ここに...の内容をそのまま貼り付ける」というコメントの位置に、Step 1で確認した`shinsei.tsx`の該当行の内容（`<div className="item-title">`等から始まるテーブル群）を、コメントを削除した上でそのまま挿入する。

- [ ] **Step 5: TypeScriptの型チェックを確認する**

Run: `npx tsc --noEmit`
Expected: エラーなし。`isNtype`/`isTtype`/`isPtype`が未使用警告にならないこと（Step4で使用しているため）を確認する。

- [ ] **Step 6: コミットする**

```bash
git add "src/app/(print)/print/[id]/shinsei-applicant/page.tsx"
git commit -m "feat: 申請人用PDFにN型・T型・P型のPart2ページを追加

shinsei.tsx（一括版）にのみ存在していたN型・T型・P型の申請人側
Part2コンテンツ（項目17以降）を、それぞれ専用の追加ページとして
shinsei-applicant.tsxに移植する。署名欄は既存のSignatureSection
コンポーネントに統一する。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: shinsei-applicant.tsx に R型専用ページを追加

**Files:**
- Modify: `src/app/(print)/print/[id]/shinsei-applicant/page.tsx`

- [ ] **Step 1: 移植元の内容を確認する**

`src/app/(print)/print/[id]/shinsei/page.tsx`の558〜687行目（R型 Part2：項目17〜20＋代理人＋取次者、見出しコメント「R型 Part 2（申請人用２Ｒ：項目17〜20 + 取次者）」付近）を`Read`で読む。689〜711行目の手書き署名テーブルは**移植しない**（`SignatureSection`に置き換えるため）。

- [ ] **Step 2: R型専用ページを追加する**

Task1で追加したP型ブロックの直後（V型ページのコメント直前）に、以下を追加する。

```tsx
        {/* ══════════════════════════════════════════════════════════════════════
            Page 2: R型専用ページ（家族滞在）
            ════════════════════════════════════════════════════════════════════ */}
        {isRtype && (
        <div className="page">
          <FormHeader
            partLabel="申請人等作成用　２　Ｒ"
            partLabelEn={`For applicant, Part 2 R ("Dependent")`}
          />

          {/* ここに shinsei/page.tsx の558〜687行目（R型 Part2：項目17〜20＋代理人＋取次者）の
              内容をそのまま貼り付ける。外側の {isRtype && (<>...</>)} は不要
              （このブロック自体が既にisRtypeでガードされているため）。
              689〜711行目の手書き署名テーブルは貼り付けない。 */}

          <SignatureSection role="applicant" />
        </div>
        )}

```

- [ ] **Step 3: TypeScriptの型チェックを確認する**

Run: `npx tsc --noEmit`
Expected: エラーなし。

- [ ] **Step 4: コミットする**

```bash
git add "src/app/(print)/print/[id]/shinsei-applicant/page.tsx"
git commit -m "feat: 申請人用PDFにR型（家族滞在）専用ページを追加

shinsei.tsx（一括版）にのみ存在していたR型の申請人側Part2
コンテンツ（項目17〜20・代理人・取次者）を、専用の追加ページとして
shinsei-applicant.tsxに移植する。署名欄は既存のSignatureSection
コンポーネントに統一する。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: shinsei-org.tsx に N型専用ページを追加

**Files:**
- Modify: `src/app/(print)/print/[id]/shinsei-org/page.tsx`

- [ ] **Step 1: 移植元の内容を確認する**

`src/app/(print)/print/[id]/shinsei/page.tsx`の1221〜1391行目（N型所属機関情報：機関情報・就労条件・派遣先・署名、見出しコメント「所属機関等作成用 Part 1（就労系のみ）」付近）を`Read`で読む。1322〜1340行目・1370〜1387行目の手書き署名テーブル（「機関代表者・担当者署名」）は**移植しない**（既存の`SignatureSection role="organization"`に置き換えるため）。

- [ ] **Step 2: `data`の分割代入にN/R型の判定変数を追加する**

`src/app/(print)/print/[id]/shinsei-org/page.tsx`の31行目を変更する。

変更前:
```tsx
  const { app, applicant, org, form, familyMembers, workHistory, today, isChange, formType, cat, isVtype } = data;
```

変更後:
```tsx
  const { app, applicant, org, form, familyMembers, workHistory, today, isChange, formType, cat, isVtype } = data;
  const isNtype = ['N', 'L', 'I'].includes(cat);
  const isRtype = cat === 'R';
  const needsOrg = ['N', 'M', 'L', 'I', 'V', 'P', 'Q', 'Y'].includes(cat);
```

- [ ] **Step 3: `!isVtype`の案内表示の条件を変更する**

44〜49行目を変更する。

変更前:
```tsx
        {!isVtype && (
          <div className="no-print" style={{ padding: "60px 24px", textAlign: "center", color: "#64748b", fontSize: "14px", lineHeight: "1.8" }}>
            この書類（所属機関等作成用）は、在留資格区分が「特定技能」の場合のみ作成されます。<br />
            現在の申請内容では、この書類は出力されません。
          </div>
        )}
```

変更後:
```tsx
        {!isVtype && !isNtype && !isRtype && !needsOrg && (
          <div className="no-print" style={{ padding: "60px 24px", textAlign: "center", color: "#64748b", fontSize: "14px", lineHeight: "1.8" }}>
            この在留資格区分では、所属機関用・扶養者用の書類は作成されません。<br />
            現在の申請内容では、この書類は出力されません。
          </div>
        )}
```

- [ ] **Step 4: N型専用ページを、V型ページのブロックの直前に追加する**

51行目（`{isVtype && (`の直前）に、以下を追加する。

```tsx
        {isNtype && (
        <div className="page">
          <FormHeader
            showGov
            formNumber={formNumber}
            title={formTitle.ja}
            titleEn={formTitle.en}
            partLabel="所属機関等作成用　１"
            partLabelEn="For organization, Part 1"
          />

          {/* ここに shinsei/page.tsx の1221〜1391行目（N型所属機関情報）の内容をそのまま
              貼り付ける。外側の {needsOrg && isNtype && (<>...</>)} は不要
              （このブロック自体が既にisNtypeでガードされているため）。
              1322〜1340行目・1370〜1387行目の「機関代表者・担当者署名」の手書きテーブルは
              貼り付けず、その位置にそれぞれ <SignatureSection role="organization"
              orgName={fmt(org?.nameJa) || fmt(form.orgName)}
              representativeTitle={fmt(org?.representativeTitle)}
              representativeName={fmt(org?.representativeName) || fmt(form.position)} />
              を配置する（派遣先がある場合は2回目の署名欄も同様に置き換える）。 */}
        </div>
        )}

```

- [ ] **Step 5: TypeScriptの型チェックを確認する**

Run: `npx tsc --noEmit`
Expected: エラーなし。

- [ ] **Step 6: コミットする**

```bash
git add "src/app/(print)/print/[id]/shinsei-org/page.tsx"
git commit -m "feat: 所属機関用PDFにN型専用ページを追加

shinsei.tsx（一括版）にのみ存在していたN型の所属機関側コンテンツ
（機関情報・就労条件・派遣先）を、専用ページとしてshinsei-org.tsx
に移植する。署名欄は既存のSignatureSection（role=organization）
コンポーネントに統一する。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: shinsei-org.tsx に R型（扶養者用）専用ページとフリーフィールドページを追加

**Files:**
- Modify: `src/app/(print)/print/[id]/shinsei-org/page.tsx`

- [ ] **Step 1: 移植元の内容を確認する**

`src/app/(print)/print/[id]/shinsei/page.tsx`の以下を`Read`で読む：
- 716〜799行目（扶養者用コンテンツ：扶養している家族・扶養者情報、見出しコメント「扶養者用Ｒ」直後）。801〜823行目の手書き署名テーブルは**移植しない**（`SignatureSection role="supporter"`に置き換えるため）。
- 1394〜1408行目（N型以外の就労系区分用フリーフィールド、見出しコメント「所属機関情報（N型以外・就労系の場合のフリーフィールド）」付近）。

- [ ] **Step 2: R型（扶養者用）ページを、N型ページの直後に追加する**

Task3で追加したN型ブロックの直後に、以下を追加する。

```tsx
        {isRtype && (
        <div className="page">
          <FormHeader
            showGov
            formNumber={formNumber}
            title={formTitle.ja}
            titleEn={formTitle.en}
            partLabel="扶養者用"
            partLabelEn="For supporter"
          />
          <div className="role-banner">【扶養者用】</div>

          {/* ここに shinsei/page.tsx の716〜799行目（扶養している家族・扶養者情報）の内容を
              そのまま貼り付ける。801〜823行目の手書き署名テーブルは貼り付けない。 */}

          <SignatureSection role="supporter" />
        </div>
        )}

        {needsOrg && !isNtype && !isRtype && form.freeformOrgNotes && (
        <div className="page">
          <FormHeader
            showGov
            formNumber={formNumber}
            title={formTitle.ja}
            titleEn={formTitle.en}
            partLabel="所属機関等作成用"
            partLabelEn="For organization"
          />

          {/* ここに shinsei/page.tsx の1394〜1408行目（フリーフィールド）の内容をそのまま
              貼り付ける。外側の {needsOrg && !isNtype && form.freeformOrgNotes && (<>...</>)}
              は不要（このブロック自体が既にガードされているため）。 */}

          <SignatureSection role="organization"
            orgName={fmt(org?.nameJa) || fmt(form.orgName)}
            representativeTitle={fmt(org?.representativeTitle)}
            representativeName={fmt(org?.representativeName) || fmt(form.position)}
          />
        </div>
        )}

```

- [ ] **Step 3: ファイル冒頭のドキュメントコメントを更新する**

1〜15行目を変更する。

変更前:
```tsx
/**
 * 所属機関等作成用 PDF（計5ページ）
 * ─────────────────────────────────
 * Page 1: 所属機関等作成用 １ V — 雇用契約・所属機関
 * Page 2: 所属機関等作成用 2 V — 派遣先・職業紹介事業者・取次機関
 * Page 3: 所属機関等作成用 3 V — コンプライアンス確認（(11)〜(21)）
 * Page 4: 所属機関等作成用 4 V — コンプライアンス確認（(22)〜(33)）
 * Page 5: 所属機関等作成用 4 V — 1号特定技能外国人支援計画（(34)〜(42)・4(1)〜(16)）＋ 所属機関署名
 *
 * 本書類は在留資格カテゴリが V（特定技能）の場合のみ作成が必要なため、
 * isVtype が false の場合は何も出力しない（画面上に案内のみ表示）。
 *
 * 様式番号・申請書タイトルはヘッド部分（FormHeader）で全ページ共通のデザインに統一しつつ、
 * 申請書類の種別（formType）に応じて getFormNumber() / FORM_TITLE_MAP から動的に取得する。
 */
```

変更後:
```tsx
/**
 * 所属機関等作成用 / 扶養者用 PDF
 * ─────────────────────────────────
 * V型（特定技能）: 計5ページ（雇用契約・所属機関／派遣先等／コンプライアンス確認×2／支援計画＋署名）
 * N型（技術・人文知識・国際業務 等）: 機関情報・就労条件・派遣先＋署名の1ページ
 * R型（家族滞在）: 扶養者情報＋扶養者署名の1ページ（【扶養者用】バナー付き）
 * その他の就労系区分（M/L/I/P/Q/Y）でフリーフィールドの入力がある場合: フリーフィールド＋署名の1ページ
 *
 * 上記のいずれにも該当しない在留資格区分の場合は何も出力しない（画面上に案内のみ表示）。
 *
 * 様式番号・申請書タイトルはヘッド部分（FormHeader）で全ページ共通のデザインに統一しつつ、
 * 申請書類の種別（formType）に応じて getFormNumber() / FORM_TITLE_MAP から動的に取得する。
 */
```

- [ ] **Step 4: TypeScriptの型チェックを確認する**

Run: `npx tsc --noEmit`
Expected: エラーなし。

- [ ] **Step 5: コミットする**

```bash
git add "src/app/(print)/print/[id]/shinsei-org/page.tsx"
git commit -m "feat: 所属機関用PDFにR型（扶養者用）ページとフリーフィールドページを追加

shinsei.tsx（一括版）にのみ存在していたR型の扶養者側コンテンツと、
N型以外の就労系区分用フリーフィールドを、それぞれ専用ページとして
shinsei-org.tsxに移植する。署名欄は既存のSignatureSection
（role=supporter / organization）コンポーネントに統一する。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: 資格外活動許可申請書を独立ルートとして切り出す

**Files:**
- Create: `src/app/(print)/print/[id]/gaikatsu/page.tsx`
- Modify: `src/app/(dashboard)/applications/[id]/shinsei-form/page.tsx`

- [ ] **Step 1: 移植元の内容を確認する**

`src/app/(print)/print/[id]/shinsei/page.tsx`の1410〜1618行目（資格外活動許可申請書、見出しコメント「資格外活動許可申請書（別記第二十八号様式）」付近）を`Read`で読む。表示条件は1411〜1413行目：
```tsx
          {(form.gaikatsuNeeded === "有" ||
            (isRtype && yes(form.partTimeWorkExistsR)) ||
            (isPtype)) && (form.gaikatsuActivityType || form.gaikatsuCurrentActivity || form.gaikatsuEmployerName) && (
```

また、既存の`riyusho/page.tsx`を`Read`で読み、新規ファイルが従うべき構造パターン（importの並び・`loadShinseiData`の使い方・`<>`ルート要素・`ShinseiPrintToolbar`または`PrintTrigger`の使用方法）を確認する。

- [ ] **Step 2: 新規ファイル`gaikatsu/page.tsx`を作成する**

`src/app/(print)/print/[id]/gaikatsu/page.tsx`を新規作成する。先頭は以下の形にする（importは`riyusho/page.tsx`で実際に使われているものに揃える。`isRtype`/`isPtype`の判定方法・`yes()`関数も`riyusho/page.tsx`や`shinsei-shared.tsx`から正しくimportすること）：

```tsx
/**
 * 資格外活動許可申請書（別記第二十八号様式・第十九条関係）
 * ─────────────────────────────────
 * 家族滞在（R型）で資格外活動の実績がある場合、または留学（P型）の場合に、
 * 資格外活動許可申請書の項目に入力があれば出力する。
 */
import { notFound } from "next/navigation";
import {
  loadShinseiData, PRINT_STYLES,
  fmt, fmtDate, fmtSex, yes,
} from "../shinsei-shared";
import { PrintTrigger } from "../print-trigger";

export default async function GaikatsuPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadShinseiData(id);
  if (!data) notFound();

  const { app, form, cat } = data;
  const isRtype = cat === 'R';
  const isPtype = cat === 'P';

  const shouldShow =
    (form.gaikatsuNeeded === "有" || (isRtype && yes(form.partTimeWorkExistsR)) || isPtype) &&
    (form.gaikatsuActivityType || form.gaikatsuCurrentActivity || form.gaikatsuEmployerName);

  return (
    <>
      <meta charSet="utf-8" />
      <title>資格外活動許可申請書 - {form.familyNameEn} {form.givenNameEn}</title>
      <style>{PRINT_STYLES}</style>
      <PrintTrigger applicationId={id} />

      {!shouldShow && (
        <div className="no-print" style={{ padding: "60px 24px", textAlign: "center", color: "#64748b", fontSize: "14px", lineHeight: "1.8" }}>
          現在の申請内容では、資格外活動許可申請書は出力されません。
        </div>
      )}

      {shouldShow && (
        <div className="page">
          {/* ここに shinsei/page.tsx の1410〜1618行目（資格外活動許可申請書の内容部分、
              外側の条件分岐 {(...) && (...) && (<>...</>)} を除いたJSX本体）をそのまま
              貼り付ける。最上位の <div className="section page-break">資格外活動許可申請書
              （別記第二十八号様式・第十九条関係）</div> の "page-break" クラスは
              このファイルでは不要（既にこのページが新しい物理ページとして独立しているため）
              なので "section" のみにする。 */}
        </div>
      )}
    </>
  );
}
```

`PRINT_STYLES`が`shinsei-shared.tsx`から実際にexportされていることを確認する。されていない場合は、`riyusho/page.tsx`が実際に使っているスタイル定義の方式（独自の`<style>{...}</style>`を直接書く方式かもしれない）に合わせて書き換える。

- [ ] **Step 3: TypeScriptの型チェックを確認する**

Run: `npx tsc --noEmit`
Expected: エラーなし。

- [ ] **Step 4: `shinsei-form/page.tsx`に資格外活動ボタンを追加する**

`src/app/(dashboard)/applications/[id]/shinsei-form/page.tsx`を変更する。

変更前（44〜46行目付近）:
```tsx
  // 理由書PDF表示条件: 家族滞在 かつ（認定 or 変更）
  const showRiyusho = application.visaType === "dependent"
    && (application.applicationType === "certification" || application.applicationType === "change");
```

変更後:
```tsx
  // 理由書PDF表示条件: 家族滞在 かつ（認定 or 変更）
  const showRiyusho = application.visaType === "dependent"
    && (application.applicationType === "certification" || application.applicationType === "change");

  // 資格外活動許可申請書PDF表示条件: 資格外活動の入力があり、必要事項が入力されている場合
  // isYes()はshinsei-shared.tsxのyes()と同じ判定基準をこのファイル内で再現したもの
  // （(print)配下と(dashboard)配下をまたぐimportを避けるため、ロジックのみ複製する）
  const isYes = (v: string | null | undefined) =>
    !!v && (v === "有" || v.startsWith("有（") || v === "あり" || v.startsWith("あり（"));
  const isRtypeForm = initialForm.visaFormCategory === 'R';
  const isPtypeForm = initialForm.visaFormCategory === 'P';
  const showGaikatsu =
    (isYes(initialForm.gaikatsuNeeded) || (isRtypeForm && isYes(initialForm.partTimeWorkExistsR)) || isPtypeForm) &&
    !!(initialForm.gaikatsuActivityType || initialForm.gaikatsuCurrentActivity || initialForm.gaikatsuEmployerName);
```

変更前（理由書ボタンのJSX、86〜95行目付近）:
```tsx
          {showRiyusho && (
            <Link
              href={`/print/${id}/riyusho`}
              target="_blank"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors border border-gray-300"
            >
              <FileDown className="w-4 h-4" />
              理由書PDF
            </Link>
          )}
```

変更後（理由書ボタンの直後に資格外活動ボタンを追加）:
```tsx
          {showRiyusho && (
            <Link
              href={`/print/${id}/riyusho`}
              target="_blank"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors border border-gray-300"
            >
              <FileDown className="w-4 h-4" />
              理由書PDF
            </Link>
          )}
          {showGaikatsu && (
            <Link
              href={`/print/${id}/gaikatsu`}
              target="_blank"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors border border-gray-300"
            >
              <FileDown className="w-4 h-4" />
              資格外活動許可申請書PDF
            </Link>
          )}
```

`initialForm.visaFormCategory`・`initialForm.gaikatsuNeeded`・`initialForm.partTimeWorkExistsR`・`initialForm.gaikatsuActivityType`等のフィールドが`ApplicationFormData`型（`initialForm`の型）に実際に存在することを、実装時に`src/lib/form-types.ts`で確認する。

- [ ] **Step 5: TypeScriptの型チェックを確認する**

Run: `npx tsc --noEmit`
Expected: エラーなし。

- [ ] **Step 6: コミットする**

```bash
git add "src/app/(print)/print/[id]/gaikatsu/page.tsx" "src/app/(dashboard)/applications/[id]/shinsei-form/page.tsx"
git commit -m "feat: 資格外活動許可申請書を独立ルートとして切り出す

shinsei.tsx（一括版）に埋め込まれていた資格外活動許可申請書
（別記第二十八号様式）を、riyusho.tsx・noufusho.tsxと同じ構造の
独立ルート（/print/[id]/gaikatsu）として切り出す。表示条件を
満たす場合のみ、申請書作成画面にダウンロードボタンを表示する。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 6: ビルド確認・手動テスト・デプロイ・報告

**Files:** なし（検証のみ）

- [ ] **Step 1: フルビルドを実行する**

```bash
rm -rf .next
rm -rf .next
npm run build
```

Expected: 全ルート（新規`/print/[id]/gaikatsu`を含む）がエラーなくビルドされる。

- [ ] **Step 2: 手動機能テストの確認項目を整理する（実際の確認はユーザーに依頼）**

1. N型・T型・R型・P型・V型それぞれの案件で`/print/[id]/shinsei-applicant`を開き、Page1（共通）の後に、該当カテゴリ専用のPart2ページが正しく表示され、末尾に申請人署名欄が表示されることを確認する。
2. N型・R型・V型・その他就労系（フリーフィールド入力済み）の案件で`/print/[id]/shinsei-org`を開き、該当する所属機関用または扶養者用のページが正しく表示されることを確認する。N型・R型以外で`shinsei.tsx`の出力（削除前に確認可能であれば）と内容を比較する。
3. 資格外活動の対象データを持つR型・P型の案件で`/print/[id]/gaikatsu`を開き、正しく出力されることを確認する。対象外の案件では「出力されません」の案内が表示されることを確認する。
4. `shinsei-form`画面で、資格外活動の条件を満たす案件にのみ「資格外活動許可申請書PDF」ボタンが表示されることを確認する。

- [ ] **Step 3: featureブランチにpushする**

```bash
git push origin feature/pdf-split-and-org-master
```

- [ ] **Step 4: 本番環境にデプロイする**

```bash
npx vercel --prod
```

- [ ] **Step 5: ユーザーに報告する**

Step2で整理した手動テスト項目（実際の確認はユーザー自身に依頼する旨を明記）と、次のフェーズ（Phase 3：余白ドラッグ調整機能の移植）に進む準備ができていることを報告する。

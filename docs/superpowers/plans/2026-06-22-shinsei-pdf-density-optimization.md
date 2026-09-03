# 申請書PDF（一括）の余白ゼロ化・枚数最小化・ロール分離 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `src/app/print/[id]/shinsei/page.tsx`（「申請書PDF（一括）」）について、ページ間の余白欠落バグを修正し、ロール境目（申請人用／所属機関用／扶養者用）のみに強制改ページを集約し、印刷密度を高めて総ページ数を削減する。

**Architecture:** CSSの`@page{margin:0}`+content paddingという誤った余白実装を`@page{margin:Xmm Ymm}`方式に統一し、ロール内部の細かい強制改ページ（`page-break-before:always`）を撤廃して連続フロー化、印刷時のフォント・行間・パディングを圧縮する。トップレベルのロール境目4箇所にのみ識別バナー付きの強制改ページを残す。

**Tech Stack:** Next.js 16 (App Router, Server Component) / インラインCSS（`<style>{...}</style>`） / ブラウザの`window.print()`によるPDF保存（`shinsei-print-toolbar.tsx`）

**参照仕様書:** `docs/superpowers/specs/2026-06-22-shinsei-pdf-density-optimization-design.md`

**検証方法について:** このプロジェクトには自動テストランナーが設定されていないため、各タスクの「テスト」は `npm run build` と最終タスクでの手動確認に置き換える。対象ファイルは1ファイル（`src/app/print/[id]/shinsei/page.tsx`）のみ。

---

## IMPORTANT: Pre-existing unrelated changes — DO NOT TOUCH（全タスク共通）

作業ディレクトリには本作業と無関係な未コミット変更が存在する場合がある（`dev.log`, `dev-test.log`, `src/actions/applications.ts`, `src/app/api/applications/[id]/checklist/[itemId]/extra-file/route.ts`, `src/app/print/[id]/shinsei-applicant/page.tsx`, `src/app/print/[id]/shinsei-shared.tsx`, `src/lib/db/schema.ts` など）。**これらのファイルは一切ステージ・コミットしないこと。** コミット時は必ず `src/app/print/[id]/shinsei/page.tsx` のみを明示的に`git add`し、`git add -A`や`git add .`は使用しないこと。

---

### Task 1: `<style>`ブロックの余白アーキテクチャ修正・密度圧縮

**Files:**
- Modify: `src/app/print/[id]/shinsei/page.tsx`（`<style>{...}</style>`ブロック全体、129〜189行目付近）

- [ ] **Step 1: 既存の`<style>`ブロック全体を置き換える**

変更前（ファイル内で完全一致する一塊として存在する）:
```typescript
        <style>{`
          /* ── PDF/印刷の幅調整: ここを変更すると全体の幅が追従する ── */
          :root{
            --pdf-print-width: ${PDF_PRINT_WIDTH};
          }

          *{box-sizing:border-box;margin:0;padding:0;}
          body{
            font-family:"MS Mincho","ＭＳ 明朝","Hiragino Mincho ProN","游明朝",serif;
            font-size:11px;color:#000;background:#f3f4f6;line-height:1.5;
          }
          /* PDFの実際の用紙幅も --pdf-print-width に連動させる。
             ※ @page の size は CSS変数(var())を解釈できないため、PDF_PRINT_WIDTH の値を
                直接埋め込んでいる。PDF_PRINT_WIDTH は "210mm" のような長さ単位で指定すること。 */
          @page{size:${PDF_PRINT_WIDTH} 297mm;margin:0;}
          .page{background:#fff;max-width:var(--pdf-print-width);margin:0 auto;padding:14mm 16mm;min-height:297mm;}
          @media screen{.page{margin:20px auto;box-shadow:0 4px 24px rgba(0,0,0,.12);border-radius:4px;}}
          @media print{
            body{background:#fff;}
            *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important;}
            /* @page で確保した用紙幅いっぱい(100%)に追従させる */
            .page{padding:10mm 13mm;width:100%;max-width:100%;min-height:auto;}
            .no-print{display:none!important;}
          }

          .form-title{text-align:center;font-size:15px;font-weight:bold;border:2px solid #000;padding:7px 14px;margin-bottom:10px;letter-spacing:0.05em;}
          .form-subtitle{font-size:9px;text-align:right;margin-bottom:10px;color:#444;}

          table{width:100%;border-collapse:collapse;margin-bottom:8px;}
          td,th{border:1px solid #333;padding:4px 8px;vertical-align:middle;font-size:10.5px;line-height:1.45;}
          .lbl{background:#d5d5d5;font-weight:bold;white-space:nowrap;width:25%;}
          .lbl-w20{width:20%;}
          .lbl-wrap{white-space:normal!important;word-break:break-word;overflow-wrap:break-word;line-height:1.35;}

          .section{background:#1c1c1c;color:#fff;font-weight:bold;font-size:11.5px;padding:5px 9px;margin:14px 0 5px;letter-spacing:0.03em;}
          .section2{background:#444;color:#fff;font-size:10.5px;padding:3px 8px;margin:8px 0 4px;}
          .section3{background:#777;color:#fff;font-size:10px;padding:3px 7px;margin:5px 0 3px;}

          /* V型テーブル: 長い項目名に対応 */
          .v-tbl{table-layout:fixed;}
          .v-tbl td,.v-tbl th{word-break:break-word;overflow-wrap:break-word;white-space:normal;}
          .v-tbl .lbl{white-space:normal;word-break:break-word;overflow-wrap:break-word;line-height:1.35;}

          /* 省略可能セクション */
          body.omit-vCompliance1 .omittable-vCompliance1{display:none!important;}
          body.omit-vCompliance2 .omittable-vCompliance2{display:none!important;}
          body.omit-vDispatch .omittable-vDispatch{display:none!important;}
          body.omit-vPlacement .omittable-vPlacement{display:none!important;}
          body.omit-vIntermediary .omittable-vIntermediary{display:none!important;}
          body.omit-vRso .omittable-vRso{display:none!important;}
          body.omit-vWorkHistory .omittable-vWorkHistory{display:none!important;}

          .sign-table td{height:44px;}
          .page-break{page-break-before:always;}

          /* 署名日・年月日の表示/非表示切替 */
          .sign-date{transition:visibility 0s;white-space:nowrap;}
          body.hide-sign-date .sign-date{visibility:hidden;}
          @media print{body.hide-sign-date .sign-date{visibility:hidden!important;}}
          th{background:#c8c8c8;font-weight:bold;}
        `}</style>
```

変更後:
```typescript
        <style>{`
          /* ── PDF/印刷の幅調整: ここを変更すると全体の幅が追従する ── */
          :root{
            --pdf-print-width: ${PDF_PRINT_WIDTH};
          }

          *{box-sizing:border-box;margin:0;padding:0;}
          body{
            font-family:"MS Mincho","ＭＳ 明朝","Hiragino Mincho ProN","游明朝",serif;
            font-size:11px;color:#000;background:#f3f4f6;line-height:1.5;
          }
          /* PDFの実際の用紙幅も --pdf-print-width に連動させる。
             ※ @page の size は CSS変数(var())を解釈できないため、PDF_PRINT_WIDTH の値を
                直接埋め込んでいる。PDF_PRINT_WIDTH は "210mm" のような長さ単位で指定すること。
             ※ margin は @page 側に持たせる（ページボックス自体の余白のため、強制改ページ・
                自然な改ページで生成されるすべての物理ページに自動で適用される）。
                以前は margin:0 とし .page の padding で余白を表現していたが、padding は
                要素全体に1回しか効かないため、改ページ後のページで余白が消える不具合があった。 */
          @page{size:${PDF_PRINT_WIDTH} 297mm;margin:6mm 8mm;}
          .page{background:#fff;max-width:var(--pdf-print-width);margin:0 auto;padding:14mm 16mm;min-height:297mm;}
          @media screen{.page{margin:20px auto;box-shadow:0 4px 24px rgba(0,0,0,.12);border-radius:4px;}}
          @media print{
            body{background:#fff;font-size:8.5px;line-height:1.1;}
            *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important;}
            /* 余白は @page の margin に一本化したため、.page 側の padding は 0 にする */
            .page{padding:0;width:100%;max-width:100%;min-height:auto;}
            .no-print{display:none!important;}
            /* 行・表ヘッダーの途中分断を防止 */
            tr{break-inside:avoid;page-break-inside:avoid;}
            thead{display:table-header-group;}
            /* セル・テーブル間隔を圧縮 */
            td,th{padding:1.5px 4px;font-size:8.5px;line-height:1.1;}
            table{margin-bottom:3px;}
            /* セクション見出しの直後分断を防止しつつ間隔を圧縮 */
            .section{margin:4px 0 2px;}
            .section2{margin:3px 0 2px;}
            .section3{margin:2px 0 1px;}
            .section,.section2,.section3{break-after:avoid;page-break-after:avoid;}
            .bilingual{font-size:6.5px;}
          }

          .form-title{text-align:center;font-size:15px;font-weight:bold;border:2px solid #000;padding:7px 14px;margin-bottom:10px;letter-spacing:0.05em;}
          .form-subtitle{font-size:9px;text-align:right;margin-bottom:10px;color:#444;}

          table{width:100%;border-collapse:collapse;margin-bottom:8px;}
          td,th{border:1px solid #333;padding:4px 8px;vertical-align:middle;font-size:10.5px;line-height:1.45;}
          .lbl{background:#d5d5d5;font-weight:bold;white-space:nowrap;width:25%;}
          .lbl-w20{width:20%;}
          .lbl-wrap{white-space:normal!important;word-break:break-word;overflow-wrap:break-word;line-height:1.35;}

          .section{background:#1c1c1c;color:#fff;font-weight:bold;font-size:11.5px;padding:5px 9px;margin:14px 0 5px;letter-spacing:0.03em;}
          .section2{background:#444;color:#fff;font-size:10.5px;padding:3px 8px;margin:8px 0 4px;}
          .section3{background:#777;color:#fff;font-size:10px;padding:3px 7px;margin:5px 0 3px;}

          /* V型テーブル: 長い項目名に対応 */
          .v-tbl{table-layout:fixed;}
          .v-tbl td,.v-tbl th{word-break:break-word;overflow-wrap:break-word;white-space:normal;}
          .v-tbl .lbl{white-space:normal;word-break:break-word;overflow-wrap:break-word;line-height:1.35;}

          /* 省略可能セクション */
          body.omit-vCompliance1 .omittable-vCompliance1{display:none!important;}
          body.omit-vCompliance2 .omittable-vCompliance2{display:none!important;}
          body.omit-vDispatch .omittable-vDispatch{display:none!important;}
          body.omit-vPlacement .omittable-vPlacement{display:none!important;}
          body.omit-vIntermediary .omittable-vIntermediary{display:none!important;}
          body.omit-vRso .omittable-vRso{display:none!important;}
          body.omit-vWorkHistory .omittable-vWorkHistory{display:none!important;}

          .sign-table td{height:44px;}
          .page-break{page-break-before:always;}

          /* ロール識別バナー（申請人用／所属機関用／扶養者用の境目を明示） */
          .role-banner{
            text-align:center;font-size:10px;font-weight:bold;letter-spacing:0.15em;
            background:#000;color:#fff;padding:3px 0;margin-bottom:2px;
          }

          /* 署名日・年月日の表示/非表示切替 */
          .sign-date{transition:visibility 0s;white-space:nowrap;}
          body.hide-sign-date .sign-date{visibility:hidden;}
          @media print{body.hide-sign-date .sign-date{visibility:hidden!important;}}
          th{background:#c8c8c8;font-weight:bold;}
        `}</style>
```

- [ ] **Step 2: ビルドで型エラーがないことを確認**

Run: `npm run build`
Expected: エラーなく成功

- [ ] **Step 3: コミット**

```bash
git add "src/app/print/[id]/shinsei/page.tsx"
git commit -m "fix: 申請書PDF（一括）の余白を@page margin方式に統一し印刷密度を圧縮

@page{margin:0}+.pageのpaddingという実装は、改ページ後のページで
余白が消失する不具合があったため、@page{margin:6mm 8mm}に統一。
印刷時のフォント・行間・セルpaddingを圧縮し、行の途中分断防止
（break-inside:avoid）と見出し直後の分断防止（break-after:avoid）を追加。
ロール識別バナー用CSSクラスを追加（Task3で使用）。
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: ロール内部の強制改ページを撤廃（連続フロー化）

**Files:**
- Modify: `src/app/print/[id]/shinsei/page.tsx`

以下12箇所はいずれも「申請人等作成用」または「所属機関等作成用」**内部**のサブセクション境目（Part1→Part2、V型の各ページ番号、所属機関等作成用V1〜V5の各セクション）であり、トップレベルのロール境目ではない。`className`から` page-break`を削除し、`className="section"`のみに変更する（見出し自体の見た目は変えない）。

- [ ] **Step 1: 申請人等作成用 Part 2 N（就労・学歴）の強制改ページを削除**

変更前:
```typescript
              <div className="section page-break">
                申請人等作成用　Part 2 N　— 就労・学歴（項目 {p2Base}〜{p2Base + 5}）
              </div>
```

変更後:
```typescript
              <div className="section">
                申請人等作成用　Part 2 N　— 就労・学歴（項目 {p2Base}〜{p2Base + 5}）
              </div>
```

- [ ] **Step 2: 申請人等作成用 Part 2 T（配偶者等の情報）の強制改ページを削除**

変更前:
```typescript
              <div className="section page-break">申請人等作成用　Part 2 T　— 配偶者等の情報</div>
```

変更後:
```typescript
              <div className="section">申請人等作成用　Part 2 T　— 配偶者等の情報</div>
```

- [ ] **Step 3: 申請人等作成用２Ｒの強制改ページを削除**

変更前:
```typescript
              <div className="section page-break">
                申請人等作成用　２　Ｒ　—「家族滞在」{isChange ? '在留資格変更用' : '在留期間更新用'}　（項目 17〜20）
              </div>
```

変更後:
```typescript
              <div className="section">
                申請人等作成用　２　Ｒ　—「家族滞在」{isChange ? '在留資格変更用' : '在留期間更新用'}　（項目 17〜20）
              </div>
```

- [ ] **Step 4: 申請人等作成用 Part 2 P（在籍学校・費用支弁）の強制改ページを削除**

変更前:
```typescript
              <div className="section page-break">申請人等作成用　Part 2 P　— 在籍学校・費用支弁</div>
```

変更後:
```typescript
              <div className="section">申請人等作成用　Part 2 P　— 在籍学校・費用支弁</div>
```

- [ ] **Step 5: 申請人等作成用２Ｖの強制改ページを削除**

変更前:
```typescript
              <div className="section page-break">
                申請人等作成用 ２　　　Ｖ　（「特定技能（１号）」・「特定技能（２号）」）
              </div>
```

変更後:
```typescript
              <div className="section">
                申請人等作成用 ２　　　Ｖ　（「特定技能（１号）」・「特定技能（２号）」）
              </div>
```

- [ ] **Step 6: 申請人等作成用３Ｖの強制改ページを削除**

変更前:
```typescript
              <div className="section page-break">
                申請人等作成用 ３　　　Ｖ　（「特定技能（１号）」・「特定技能（２号）」）
              </div>
```

変更後:
```typescript
              <div className="section">
                申請人等作成用 ３　　　Ｖ　（「特定技能（１号）」・「特定技能（２号）」）
              </div>
```

- [ ] **Step 7: 所属機関等作成用２Ｖ（派遣先等）の強制改ページを削除**

変更前:
```typescript
                <div className="section page-break">
                  所属機関等作成用 ２　　　Ｖ　— 派遣先・職業紹介事業者・取次機関
                </div>
```

変更後:
```typescript
                <div className="section">
                  所属機関等作成用 ２　　　Ｖ　— 派遣先・職業紹介事業者・取次機関
                </div>
```

- [ ] **Step 8: 所属機関等作成用３Ｖ（コンプライアンス11〜21）の強制改ページを削除**

変更前:
```typescript
                <div className="section page-break">
                  所属機関等作成用 ３　　　Ｖ　— コンプライアンス確認（(11)〜(21)）
                </div>
```

変更後:
```typescript
                <div className="section">
                  所属機関等作成用 ３　　　Ｖ　— コンプライアンス確認（(11)〜(21)）
                </div>
```

- [ ] **Step 9: 所属機関等作成用４Ｖ（コンプライアンス22〜33）の強制改ページを削除**

変更前:
```typescript
                <div className="section page-break">
                  所属機関等作成用 ４　　　Ｖ　— コンプライアンス確認（(22)〜(33)）
                </div>
```

変更後:
```typescript
                <div className="section">
                  所属機関等作成用 ４　　　Ｖ　— コンプライアンス確認（(22)〜(33)）
                </div>
```

- [ ] **Step 10: 所属機関等作成用５Ｖ（登録支援機関）の強制改ページを削除**

変更前:
```typescript
                <div className="section page-break">
                  所属機関等作成用 ５　　　Ｖ　— 登録支援機関（支援計画の全部を委託する場合）
                </div>
```

変更後:
```typescript
                <div className="section">
                  所属機関等作成用 ５　　　Ｖ　— 登録支援機関（支援計画の全部を委託する場合）
                </div>
```

- [ ] **Step 11: 申請人等作成用Part2（補足情報フォールバック）の強制改ページを削除**

変更前:
```typescript
              <div className="section page-break">申請人等作成用　Part 2　— 補足情報</div>
```

変更後:
```typescript
              <div className="section">申請人等作成用　Part 2　— 補足情報</div>
```

- [ ] **Step 12: 所属機関等作成用Part2 N（派遣先等）の強制改ページを削除**

変更前:
```typescript
                  <div className="section page-break">所属機関等作成用　Part 2 N　— 派遣先等（項目 {orgDispatchNo}）</div>
```

変更後:
```typescript
                  <div className="section">所属機関等作成用　Part 2 N　— 派遣先等（項目 {orgDispatchNo}）</div>
```

- [ ] **Step 13: ビルドで型エラーがないことを確認**

Run: `npm run build`
Expected: エラーなく成功

- [ ] **Step 14: コミット**

```bash
git add "src/app/print/[id]/shinsei/page.tsx"
git commit -m "fix: ロール内部のサブセクション境目から強制改ページを撤廃

Part1→Part2、V型の各ページ番号、所属機関等作成用V1〜V5の各セクションなど、
ロール内部の12箇所の強制改ページ（page-break-before:always）を削除し、
連続フロー化することで総ページ数を削減する。トップレベルのロール境目
（申請人用／所属機関用／扶養者用）の強制改ページはTask3で維持・強化する。
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: ロール境目4箇所に識別バナーを追加

**Files:**
- Modify: `src/app/print/[id]/shinsei/page.tsx`

以下4箇所は「申請人等作成用」→「所属機関等作成用」または「→扶養者等作成用」へ切り替わるトップレベルのロール境目であり、強制改ページ（`page-break`）はそのまま維持し、直前に識別バナー（`.role-banner`、Task1で追加済み）を追加する。

- [ ] **Step 1: 扶養者等作成用１Ｒの直前に「【扶養者用】」バナーを追加**

変更前:
```typescript
              {/* ── 扶養者用Ｒ（別ページ） ─────────────────────────────────────── */}
              <div className="section page-break">
                扶養者等作成用　１　Ｒ　—「家族滞在」{isChange ? '在留資格変更用' : '在留期間更新用'}
              </div>
```

変更後:
```typescript
              {/* ── 扶養者用Ｒ（別ページ） ─────────────────────────────────────── */}
              <div className="role-banner page-break">【扶養者用】</div>
              <div className="section">
                扶養者等作成用　１　Ｒ　—「家族滞在」{isChange ? '在留資格変更用' : '在留期間更新用'}
              </div>
```

（強制改ページは `.role-banner` 側に移し、`.section` 見出し自体からは外す。これにより改ページ直後にバナーが来て、続けて見出しが連続フローで表示される。）

- [ ] **Step 2: 所属機関等作成用１Ｖの直前に「【所属機関用】」バナーを追加**

変更前:
```typescript
              {/* ═══ 所属機関等作成用 １ V — 雇用契約・所属機関 ═══ */}
              <div className="section page-break">
                所属機関等作成用 １　　　Ｖ　（「特定技能（１号）」・「特定技能（２号）」）
              </div>
```

変更後:
```typescript
              {/* ═══ 所属機関等作成用 １ V — 雇用契約・所属機関 ═══ */}
              <div className="role-banner page-break">【所属機関用】</div>
              <div className="section">
                所属機関等作成用 １　　　Ｖ　（「特定技能（１号）」・「特定技能（２号）」）
              </div>
```

- [ ] **Step 3: 所属機関等作成用Part1 N（機関情報・雇用条件）の直前に「【所属機関用】」バナーを追加**

変更前:
```typescript
          {/* ══ 所属機関等作成用 Part 1（就労系のみ） ══════════════════════════ */}
          {needsOrg && isNtype && (
            <>
              <div className="section page-break">所属機関等作成用　Part 1 N　— 機関情報・雇用条件</div>
```

変更後:
```typescript
          {/* ══ 所属機関等作成用 Part 1（就労系のみ） ══════════════════════════ */}
          {needsOrg && isNtype && (
            <>
              <div className="role-banner page-break">【所属機関用】</div>
              <div className="section">所属機関等作成用　Part 1 N　— 機関情報・雇用条件</div>
```

- [ ] **Step 4: 所属機関情報（N型以外フリーフィールド）の直前に「【所属機関用】」バナーを追加**

変更前:
```typescript
          {/* 所属機関情報（N型以外・就労系の場合のフリーフィールド） */}
          {needsOrg && !isNtype && form.freeformOrgNotes && (
            <>
              <div className="section page-break">所属機関等作成用</div>
```

変更後:
```typescript
          {/* 所属機関情報（N型以外・就労系の場合のフリーフィールド） */}
          {needsOrg && !isNtype && form.freeformOrgNotes && (
            <>
              <div className="role-banner page-break">【所属機関用】</div>
              <div className="section">所属機関等作成用</div>
```

- [ ] **Step 5: ビルドで型エラーがないことを確認**

Run: `npm run build`
Expected: エラーなく成功

- [ ] **Step 6: コミット**

```bash
git add "src/app/print/[id]/shinsei/page.tsx"
git commit -m "feat: ロール境目4箇所に【所属機関用】【扶養者用】識別バナーを追加

申請人等作成用→所属機関等作成用（N型/V型/N型以外フリーフィールドの3パターン）、
申請人等作成用→扶養者等作成用（R型）の合計4箇所の強制改ページ直前に、
コンパクトな識別バナーを追加し、入管提出用の物理的な区分を明確にする。
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

**注記:** 「資格外活動許可申請書」（別記第二十八号様式）の強制改ページはこのタスクでは変更しない。これは「所属機関用」でも「扶養者用」でもなく、別の独立した様式の添付であるため、識別バナーは付与せず既存の`page-break`のみ維持する（設計書のスコープ外項目）。

---

### Task 4: 空欄時の無駄な高さを削減（minHeight圧縮）

**Files:**
- Modify: `src/app/print/[id]/shinsei/page.tsx`

- [ ] **Step 1: 「14. 変更の理由」欄のminHeightを圧縮**

変更前（直前行が「14. 変更の理由」であることで一意に特定する）:
```typescript
                  <tr>
                    <td className="lbl">14. 変更の理由</td>
                    <td colSpan={3} style={{ whiteSpace: "pre-wrap", minHeight: "48px" }}>{fmt(form.reasonForApplication)}</td>
                  </tr>
```

変更後:
```typescript
                  <tr>
                    <td className="lbl">14. 変更の理由</td>
                    <td colSpan={3} style={{ whiteSpace: "pre-wrap", minHeight: "24px" }}>{fmt(form.reasonForApplication)}</td>
                  </tr>
```

- [ ] **Step 2: 「14. 更新の理由」欄のminHeightを圧縮**

変更前（直前行が「14. 更新の理由」であることで一意に特定する）:
```typescript
                  <tr>
                    <td className="lbl">14. 更新の理由</td>
                    <td colSpan={3} style={{ whiteSpace: "pre-wrap", minHeight: "48px" }}>{fmt(form.reasonForApplication)}</td>
                  </tr>
```

変更後:
```typescript
                  <tr>
                    <td className="lbl">14. 更新の理由</td>
                    <td colSpan={3} style={{ whiteSpace: "pre-wrap", minHeight: "24px" }}>{fmt(form.reasonForApplication)}</td>
                  </tr>
```

- [ ] **Step 3: 「活動内容詳細」欄のminHeight・行間・paddingを圧縮**

変更前:
```typescript
              <table>
                <tbody>
                  <tr>
                    <td style={{ whiteSpace: "pre-wrap", lineHeight: "1.7", minHeight: "60px", padding: "6px" }}>
                      {fmt(form.activityDetails)}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* 機関担当者署名欄 */}
```

変更後:
```typescript
              <table>
                <tbody>
                  <tr>
                    <td style={{ whiteSpace: "pre-wrap", lineHeight: "1.3", minHeight: "28px", padding: "3px" }}>
                      {fmt(form.activityDetails)}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* 機関担当者署名欄 */}
```

- [ ] **Step 4: 「現在の在留活動の内容」欄（資格外活動許可申請書）のminHeightを圧縮**

変更前:
```typescript
                    <td style={{ whiteSpace: "pre-wrap", minHeight: "50px" }}>
                      {fmt(form.gaikatsuCurrentActivity)}
                    </td>
```

変更後:
```typescript
                    <td style={{ whiteSpace: "pre-wrap", minHeight: "24px" }}>
                      {fmt(form.gaikatsuCurrentActivity)}
                    </td>
```

- [ ] **Step 5: ビルドで型エラーがないことを確認**

Run: `npm run build`
Expected: エラーなく成功

- [ ] **Step 6: コミット**

```bash
git add "src/app/print/[id]/shinsei/page.tsx"
git commit -m "fix: 自由記述欄の空欄時minHeightを圧縮し無駄な高さを削減

変更/更新の理由、活動内容詳細、資格外活動の現在の活動内容の各欄について、
データが空の場合でも枠線の高さが不必要に広がらないようminHeightを縮小する。
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: 住所＋電話番号の単独行を横並びに圧縮

**Files:**
- Modify: `src/app/print/[id]/shinsei/page.tsx`

ファイル内で「住所（所在地）」が`colSpan={3}`の単独行で、直後に「電話番号」のみの行が続く箇所が3箇所見つかった。いずれも電話番号は住所より短いため、同一行に収めて1行削減する。

- [ ] **Step 1: N型「勤務先」（{p2Base}.）の住所＋電話番号を1行に圧縮**

変更前:
```typescript
              <div className="section3">{p2Base}. 勤務先</div>
              <table>
                <tbody>
                  <tr>
                    <td className="lbl">名称</td><td>{fmt(form.employerName)}</td>
                    <td className="lbl">支店・事業所名</td><td>{fmt(form.employerBranchName)}</td>
                  </tr>
                  <tr>
                    <td className="lbl">所在地（主たる勤務場所）</td><td colSpan={3}>{fmtAddr(form.employerAddress)}</td>
                  </tr>
                  <tr>
                    <td className="lbl">電話番号</td><td>{fmt(form.employerPhone)}</td>
                    <td className="lbl"></td><td></td>
                  </tr>
                </tbody>
              </table>
```

変更後:
```typescript
              <div className="section3">{p2Base}. 勤務先</div>
              <table>
                <tbody>
                  <tr>
                    <td className="lbl">名称</td><td>{fmt(form.employerName)}</td>
                    <td className="lbl">支店・事業所名</td><td>{fmt(form.employerBranchName)}</td>
                  </tr>
                  <tr>
                    <td className="lbl">所在地（主たる勤務場所）</td><td>{fmtAddr(form.employerAddress)}</td>
                    <td className="lbl">電話番号</td><td>{fmt(form.employerPhone)}</td>
                  </tr>
                </tbody>
              </table>
```

- [ ] **Step 2: V型「17. 特定技能所属機関」の住所＋電話番号を1行に圧縮**

変更前:
```typescript
              <div className="section3">17. 特定技能所属機関</div>
              <table className="v-tbl"><tbody>
                <tr><td className="lbl" style={{width:'30%'}}>(1) 氏名又は名称</td><td colSpan={3}>{fmt(form.employerName)}</td></tr>
                <tr><td className="lbl">(2) 住所（所在地）</td><td colSpan={3}>{fmtAddr(form.employerAddress)}</td></tr>
                <tr><td className="lbl">　　電話番号</td><td colSpan={3}>{fmt(form.employerPhone)}</td></tr>
              </tbody></table>
```

変更後:
```typescript
              <div className="section3">17. 特定技能所属機関</div>
              <table className="v-tbl"><tbody>
                <tr><td className="lbl" style={{width:'30%'}}>(1) 氏名又は名称</td><td colSpan={3}>{fmt(form.employerName)}</td></tr>
                <tr><td className="lbl">(2) 住所（所在地）</td><td>{fmtAddr(form.employerAddress)}</td><td className="lbl">電話番号</td><td>{fmt(form.employerPhone)}</td></tr>
              </tbody></table>
```

- [ ] **Step 3: V型「3. 特定技能所属機関」の住所＋電話番号を1行に圧縮**

変更前:
```typescript
              <div className="section3">3. 特定技能所属機関</div>
              <table className="v-tbl"><tbody>
                <tr><td className="lbl" style={{width:'30%'}}>(1) 氏名又は名称</td><td colSpan={3}>{fmt(form.orgName)}</td></tr>
                <tr><td className="lbl">(2) 法人番号（13桁）</td><td>{fmt(form.orgCorporateNumber)}</td><td className="lbl" style={{width:'25%'}}>(3) 雇用保険番号（11桁）</td><td>{fmt(form.orgEmploymentInsuranceNo)}</td></tr>
                <tr><td className="lbl lbl-wrap">(4) 業種番号</td><td>{fmt(form.orgBusinessTypeCode)}</td><td className="lbl">追加業種番号</td><td>{fmt(form.orgBusinessTypeOtherCode)}</td></tr>
                <tr><td className="lbl">(5) 住所（所在地）</td><td colSpan={3}>{fmtAddr(form.orgAddress)}</td></tr>
                <tr><td className="lbl">　電話番号</td><td colSpan={3}>{fmt(form.orgPhone)}</td></tr>
                <tr><td className="lbl">(6) 資本金</td><td>{form.orgCapital ? Number(form.orgCapital).toLocaleString() + '円' : '　'}</td><td className="lbl">(7) 年間売上金額</td><td>{form.orgAnnualSales ? Number(form.orgAnnualSales).toLocaleString() + '円' : '　'}</td></tr>
                <tr><td className="lbl">(8) 常勤職員数</td><td>{form.orgEmployeeCount ? `${form.orgEmployeeCount}名` : '　'}</td><td className="lbl">(9) 代表者の氏名</td><td>{fmt(form.position)}</td></tr>
                {form.orgBranchName && <tr><td className="lbl">(10) 勤務させる事業所名</td><td>{fmt(form.orgBranchName)}</td><td className="lbl">所在地</td><td>{fmt(form.activityDetails)}</td></tr>}
              </tbody></table>
```

変更後:
```typescript
              <div className="section3">3. 特定技能所属機関</div>
              <table className="v-tbl"><tbody>
                <tr><td className="lbl" style={{width:'30%'}}>(1) 氏名又は名称</td><td colSpan={3}>{fmt(form.orgName)}</td></tr>
                <tr><td className="lbl">(2) 法人番号（13桁）</td><td>{fmt(form.orgCorporateNumber)}</td><td className="lbl" style={{width:'25%'}}>(3) 雇用保険番号（11桁）</td><td>{fmt(form.orgEmploymentInsuranceNo)}</td></tr>
                <tr><td className="lbl lbl-wrap">(4) 業種番号</td><td>{fmt(form.orgBusinessTypeCode)}</td><td className="lbl">追加業種番号</td><td>{fmt(form.orgBusinessTypeOtherCode)}</td></tr>
                <tr><td className="lbl">(5) 住所（所在地）</td><td>{fmtAddr(form.orgAddress)}</td><td className="lbl">電話番号</td><td>{fmt(form.orgPhone)}</td></tr>
                <tr><td className="lbl">(6) 資本金</td><td>{form.orgCapital ? Number(form.orgCapital).toLocaleString() + '円' : '　'}</td><td className="lbl">(7) 年間売上金額</td><td>{form.orgAnnualSales ? Number(form.orgAnnualSales).toLocaleString() + '円' : '　'}</td></tr>
                <tr><td className="lbl">(8) 常勤職員数</td><td>{form.orgEmployeeCount ? `${form.orgEmployeeCount}名` : '　'}</td><td className="lbl">(9) 代表者の氏名</td><td>{fmt(form.position)}</td></tr>
                {form.orgBranchName && <tr><td className="lbl">(10) 勤務させる事業所名</td><td>{fmt(form.orgBranchName)}</td><td className="lbl">所在地</td><td>{fmt(form.activityDetails)}</td></tr>}
              </tbody></table>
```

- [ ] **Step 4: ビルドで型エラーがないことを確認**

Run: `npm run build`
Expected: エラーなく成功

- [ ] **Step 5: コミット**

```bash
git add "src/app/print/[id]/shinsei/page.tsx"
git commit -m "fix: 住所単独行＋電話番号単独行を1行に圧縮（3箇所）

N型「勤務先」、V型「17.特定技能所属機関」「3.特定技能所属機関」の
各テーブルで、所在地（colSpan3の単独行）の直後にあった電話番号のみの
行を同一行へ統合し、テーブル行数を削減する。
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 6: 最終ビルド確認・手動機能テスト・デプロイ

**Files:** なし（検証のみ）

- [ ] **Step 1: クリーンビルド**

```bash
rm -rf .next
npm run build
```

Expected: エラーなく成功（OneDriveのファイルロックでEPERMが出た場合は、もう一度`rm -rf .next`を実行してから再試行する）

- [ ] **Step 2: 開発サーバーを起動し、各カテゴリの組み合わせでPDFを確認**

```bash
npm run dev
```

ブラウザで以下のURLを開き、ブラウザの印刷プレビュー（Ctrl+P / Cmd+P）で確認する: `http://localhost:3000/print/<application-id>/shinsei`

少なくとも次の組み合わせの実データ（または近い案件）で確認する:
- N型（就労系）かつ「変更」 — 所属機関用ページに【所属機関用】バナーが表示されること
- R型（家族滞在）かつ「変更」または「更新」 — 扶養者用ページに【扶養者用】バナーが表示されること
- V型（特定技能） — 所属機関用Vページに【所属機関用】バナーが表示され、V1〜V5が連続フローで詰まること

- [ ] **Step 3: 改ページの位置を確認**

各組み合わせで、強制改ページが「申請人等作成用」→「所属機関等作成用」または「→扶養者等作成用」の境目にのみ発生し、Part1→Part2やV型の各サブセクション間では発生しない（内容が収まれば同一ページに続く）ことを確認する。

- [ ] **Step 4: 全ページの余白が均等であることを確認**

印刷プレビューで2ページ目以降も含め、上下左右に約6mm/8mmの余白が均等にあることを確認する（Task1で修正した`@page margin`方式が正しく機能しているかの確認）。

- [ ] **Step 5: 行の途中分断がないことを確認**

テーブルの行が途中でページをまたいで分断されていないことを確認する（`tr{break-inside:avoid}`の確認）。

- [ ] **Step 6: 変更前との総ページ数比較**

可能であれば、変更前のコミット（`e097850`より前）でも同じ案件のPDFを確認し、総ページ数が減っていることを確認する。

- [ ] **Step 7: コミット・プッシュ・デプロイ**

```bash
git status
git push origin feature/pdf-split-and-org-master
npx vercel --prod
```

デプロイ完了後、本番URL（`https://zairyu-shinsei-system.vercel.app`）で同様の確認を行う。

---

## スコープ外（将来拡張、本計画では実装しない）

- `shinsei-applicant`/`shinsei-org`/`shinsei-shared.tsx`の変更（formType/カテゴリ別Part2の実装完了が必要な、独立した課題）
- 所属機関の署名欄への会社名・代表者名の自動記名
- 「資格外活動許可申請書」セクションの改ページ・余白調整（別様式のため対象外）

# 特定技能2号で省略される項目のPDF「省略」表記 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 特定技能2号を選択した案件のPDF出力で、特定技能1号の場合のみ必要な項目（申請人用PDFの19・21、所属機関用PDFの支援責任者等・(26)・(34)〜(42)・支援計画(1)〜(16)・登録支援機関）が空欄ではなく「省略」と明示されるようにする。

**Architecture:** `loadShinseiData`（`shinsei-shared.tsx`）に`is2Go`を追加し、共通ヘルパー`omitFor2Go(is2Go, formattedValue)`で各該当セルの表示値を「省略」に置き換える。テーブル構造・項目番号・ラベル文言は一切変更しない。

**Tech Stack:** Next.js 16 App Router、TypeScript。自動テストフレームワークは未導入のため、検証は`npx tsc --noEmit`＋`npm run build`＋ブラウザでの手動確認で行う。

参考設計書: [docs/superpowers/specs/2026-06-24-ssw2-omitted-fields-pdf-label-design.md](../specs/2026-06-24-ssw2-omitted-fields-pdf-label-design.md)

---

### Task 1: is2Go・omitFor2Goを共通化する

**Files:**
- Modify: `src/app/(print)/print/[id]/shinsei-shared.tsx`

- [ ] **Step 1: `ShinseiData`インターフェースに`is2Go`を追加する**

変更前:
```ts
  /** 特定技能（１号・２号） */
  isVtype: boolean;
  /** 所属機関情報の記載が必要な区分か */
  needsOrg: boolean;
}
```

変更後:
```ts
  /** 特定技能（１号・２号） */
  isVtype: boolean;
  /** 所属機関情報の記載が必要な区分か */
  needsOrg: boolean;
  /** 特定技能2号を選択しているか（1号の場合のみ必要な項目をPDF上で「省略」と表示するために使う） */
  is2Go: boolean;
}
```

- [ ] **Step 2: `loadShinseiData`内で`is2Go`を算出し、戻り値に含める**

変更前:
```ts
  const isVtype = cat === 'V';   // 特定技能（１号・２号）
  const needsOrg = VISA_CATEGORY_NEEDS_ORG[cat as keyof typeof VISA_CATEGORY_NEEDS_ORG] ?? false;

  return {
    app, applicant, org, form,
    familyMembers: (form.familyInJapan ?? []) as FamilyMember[],
    workHistory: (form.workHistory ?? []) as WorkHistoryEntry[],
    today,
    isChange,
    formType,
    isCoe,
    cat, isNtype, isTtype, isRtype, isPtype, isVtype, needsOrg,
  };
```

変更後:
```ts
  const isVtype = cat === 'V';   // 特定技能（１号・２号）
  const needsOrg = VISA_CATEGORY_NEEDS_ORG[cat as keyof typeof VISA_CATEGORY_NEEDS_ORG] ?? false;
  // 特定技能2号を選択している場合、特定技能1号の場合のみ記入の項目をPDF上で「省略」と表示する。
  // 判定式はshinsei-form-editor.tsxのis2Goと完全に一致させること。
  const is2Go = isVtype && form.desiredStatusOfResidence === '特定技能2号';

  return {
    app, applicant, org, form,
    familyMembers: (form.familyInJapan ?? []) as FamilyMember[],
    workHistory: (form.workHistory ?? []) as WorkHistoryEntry[],
    today,
    isChange,
    formType,
    isCoe,
    cat, isNtype, isTtype, isRtype, isPtype, isVtype, needsOrg, is2Go,
  };
```

- [ ] **Step 3: `omitFor2Go`ヘルパーを追加してexportする**

`PRINT_STYLES`のexportの直前、または`yes`関数の直後など、ファイル内の他のexport関数と同じスタイルの場所に以下を追加する。

```ts
/** is2Goがtrueの場合、表示値を「省略」に置き換える（特定技能1号の場合のみ必要な項目用） */
export function omitFor2Go(is2Go: boolean, formattedValue: string): string {
  return is2Go ? "省略" : formattedValue;
}
```

- [ ] **Step 4: TypeScriptの型チェックを確認する**

Run: `npx tsc --noEmit`
Expected: エラーなし。

- [ ] **Step 5: コミットする**

```bash
git add "src/app/(print)/print/[id]/shinsei-shared.tsx"
git commit -m "feat: is2Go・omitFor2Goヘルパーを共通化

shinsei-form-editor.tsxの特定技能2号自動非活性化ロジックと
同一の判定式（is2Go）をloadShinseiDataに追加し、申請人用・
所属機関用PDFの両ファイルで共有する。is2Goがtrueの場合に表示値を
「省略」に置き換える共通ヘルパーomitFor2Goも追加する。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: 申請人用PDF（項目19・21）に適用する

**Files:**
- Modify: `src/app/(print)/print/[id]/shinsei-applicant/page.tsx`

- [ ] **Step 1: importに`omitFor2Go`を追加し、`is2Go`を分割代入に追加する**

ファイル冒頭のimportを変更する。

変更前:
```tsx
import {
  loadShinseiData, PRINT_STYLES,
  fmt, fmtDate, fmtMoney, fmtAddr, fmtSex, fmtYesNo, yes,
  fmtAdditionalOccupations, buildAddress,
  FormHeader, SignatureSection,
  FORM_TITLE_MAP, FORM_DECLARATION_MAP, getFormNumber,
} from "../shinsei-shared";
```

変更後:
```tsx
import {
  loadShinseiData, PRINT_STYLES,
  fmt, fmtDate, fmtMoney, fmtAddr, fmtSex, fmtYesNo, yes, omitFor2Go,
  fmtAdditionalOccupations, buildAddress,
  FormHeader, SignatureSection,
  FORM_TITLE_MAP, FORM_DECLARATION_MAP, getFormNumber,
} from "../shinsei-shared";
```

`data`の分割代入に`is2Go`を追加する（既存の`isVtype`等と同じ行）。実際の現在のコードを確認し、`isVtype`が含まれる分割代入の行に`is2Go`を追加する。例：

変更前:
```tsx
  const { app, applicant, org, form, familyMembers, workHistory, today, isChange, formType, cat, isVtype } = data;
```

変更後:
```tsx
  const { app, applicant, org, form, familyMembers, workHistory, today, isChange, formType, cat, isVtype, is2Go } = data;
```

- [ ] **Step 2: 項目19（日本語能力）の4セル＋2つの条件分岐行を変更する**

変更前:
```tsx
          <table className="v-tbl"><tbody>
            <tr>
              <td className="lbl" style={{ width: "28%" }}>証明方法<br /><span className="bilingual">Method of proof</span></td>
              <td colSpan={3}>{fmt(form.japaneseAbilityProofMethod)}</td>
            </tr>
            {form.japaneseAbilityExamName1 && (
              <tr>
                <td className="lbl">試験名①</td>
                <td>{fmt(form.japaneseAbilityExamName1)}</td>
                <td className="lbl" style={{ width: "12%" }}>試験地①</td>
                <td>{fmt(form.japaneseAbilityExamCountry1)}{form.japaneseAbilityExamCountry1 === '国外' ? `（${form.japaneseAbilityExamCountryName1}）` : ''}</td>
              </tr>
            )}
            {form.japaneseAbilityExamName2 && (
              <tr>
                <td className="lbl">試験名②</td>
                <td>{fmt(form.japaneseAbilityExamName2)}</td>
                <td className="lbl">試験地②</td>
                <td>{fmt(form.japaneseAbilityExamCountry2)}{form.japaneseAbilityExamCountry2 === '国外' ? `（${form.japaneseAbilityExamCountryName2}）` : ''}</td>
              </tr>
            )}
          </tbody></table>
```

変更後:
```tsx
          <table className="v-tbl"><tbody>
            <tr>
              <td className="lbl" style={{ width: "28%" }}>証明方法<br /><span className="bilingual">Method of proof</span></td>
              <td colSpan={3}>{omitFor2Go(is2Go, fmt(form.japaneseAbilityProofMethod))}</td>
            </tr>
            {(form.japaneseAbilityExamName1 || is2Go) && (
              <tr>
                <td className="lbl">試験名①</td>
                <td>{omitFor2Go(is2Go, fmt(form.japaneseAbilityExamName1))}</td>
                <td className="lbl" style={{ width: "12%" }}>試験地①</td>
                <td>{omitFor2Go(is2Go, `${fmt(form.japaneseAbilityExamCountry1)}${form.japaneseAbilityExamCountry1 === '国外' ? `（${form.japaneseAbilityExamCountryName1}）` : ''}`)}</td>
              </tr>
            )}
            {(form.japaneseAbilityExamName2 || is2Go) && (
              <tr>
                <td className="lbl">試験名②</td>
                <td>{omitFor2Go(is2Go, fmt(form.japaneseAbilityExamName2))}</td>
                <td className="lbl">試験地②</td>
                <td>{omitFor2Go(is2Go, `${fmt(form.japaneseAbilityExamCountry2)}${form.japaneseAbilityExamCountry2 === '国外' ? `（${form.japaneseAbilityExamCountryName2}）` : ''}`)}</td>
              </tr>
            )}
          </tbody></table>
```

（試験名①②の行は、元のコードでは値が空の場合に行ごと非表示になっていた。`is2Go`の場合は行を表示したうえで「省略」と出すよう、表示条件に`|| is2Go`を追加する。）

- [ ] **Step 3: 項目21（通算在留期間）のセルを変更する**

変更前:
```tsx
          <table className="v-tbl"><tbody>
            <tr>
              <td className="lbl" style={{ width: "28%" }}>通算在留期間</td>
              <td>
                {form.cumulativeStayYears ? `${form.cumulativeStayYears}年` : ''}
                {form.cumulativeStayMonths ? `${form.cumulativeStayMonths}ヶ月` : ''}
                {!form.cumulativeStayYears && !form.cumulativeStayMonths && ''}
              </td>
            </tr>
```

変更後:
```tsx
          <table className="v-tbl"><tbody>
            <tr>
              <td className="lbl" style={{ width: "28%" }}>通算在留期間</td>
              <td>
                {omitFor2Go(
                  is2Go,
                  `${form.cumulativeStayYears ? `${form.cumulativeStayYears}年` : ''}${form.cumulativeStayMonths ? `${form.cumulativeStayMonths}ヶ月` : ''}`
                )}
              </td>
            </tr>
```

- [ ] **Step 4: TypeScriptの型チェックを確認する**

Run: `npx tsc --noEmit`
Expected: エラーなし。

- [ ] **Step 5: コミットする**

```bash
git add "src/app/(print)/print/[id]/shinsei-applicant/page.tsx"
git commit -m "feat: 申請人用PDFの項目19・21に特定技能2号の省略表記を適用

特定技能2号を選択している場合、項目19（日本語能力）・項目21
（通算在留期間）の該当欄を「省略」と表示する。項目19の試験名①②の
行は、元は値が空の場合に行ごと非表示になっていたため、2号の場合は
行を表示したうえで「省略」と出すように表示条件を調整する。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: 所属機関用PDF（支援責任者等・登録支援機関）に適用する

**Files:**
- Modify: `src/app/(print)/print/[id]/shinsei-org/page.tsx`

- [ ] **Step 1: importと分割代入に`omitFor2Go`・`is2Go`を追加する**

Task 2のStep 1と同様の変更を、このファイルのimport文と`data`の分割代入に適用する。実際の現在のコードを確認し、`omitFor2Go`をimportに追加、`is2Go`を分割代入に追加する。

- [ ] **Step 2: 支援責任者・支援担当者氏名（4セル）を変更する**

変更前:
```tsx
          <div className="sub-title">支援責任者・支援担当者</div>
          <table className="v-tbl"><tbody>
            <tr>
              <td className="lbl" style={{ width: "30%" }}>支援責任者氏名<br /><span className="bilingual">Support manager</span></td>
              <td>{fmt(form.supportManagerName)}</td>
              <td className="lbl" style={{ width: "20%" }}>役職・部署</td>
              <td>{fmt(form.supportManagerTitle)}</td>
            </tr>
            <tr>
              <td className="lbl">支援担当者氏名<br /><span className="bilingual">Support staff</span></td>
              <td>{fmt(form.supportStaffName)}</td>
              <td className="lbl">役職・部署</td>
              <td>{fmt(form.supportStaffTitle)}</td>
            </tr>
          </tbody></table>
```

変更後:
```tsx
          <div className="sub-title">支援責任者・支援担当者</div>
          <table className="v-tbl"><tbody>
            <tr>
              <td className="lbl" style={{ width: "30%" }}>支援責任者氏名<br /><span className="bilingual">Support manager</span></td>
              <td>{omitFor2Go(is2Go, fmt(form.supportManagerName))}</td>
              <td className="lbl" style={{ width: "20%" }}>役職・部署</td>
              <td>{omitFor2Go(is2Go, fmt(form.supportManagerTitle))}</td>
            </tr>
            <tr>
              <td className="lbl">支援担当者氏名<br /><span className="bilingual">Support staff</span></td>
              <td>{omitFor2Go(is2Go, fmt(form.supportStaffName))}</td>
              <td className="lbl">役職・部署</td>
              <td>{omitFor2Go(is2Go, fmt(form.supportStaffTitle))}</td>
            </tr>
          </tbody></table>
```

- [ ] **Step 3: 登録支援機関（5）の12セルを変更する**

変更前:
```tsx
          <table className="v-tbl"><tbody>
            <tr>
              <td className="lbl" style={{ width: "30%" }}>(1) 名称<br /><span className="bilingual">Name</span></td>
              <td colSpan={3}>{fmt(form.rsoName)}</td>
            </tr>
            <tr>
              <td className="lbl">(2) 法人番号（13桁）</td>
              <td>{fmt(form.rsoCorporateNo)}</td>
              <td className="lbl" style={{ width: "25%" }}>(3) 雇用保険番号</td>
              <td>{fmt(form.rsoInsuranceNo)}</td>
            </tr>
            <tr>
              <td className="lbl">(4) 所在地<br /><span className="bilingual">Address</span></td>
              <td colSpan={3}>{fmtAddr(form.rsoAddress)}</td>
            </tr>
            <tr>
              <td className="lbl" style={{ paddingLeft: "12px" }}>電話番号</td>
              <td colSpan={3}>{fmt(form.rsoPhone)}</td>
            </tr>
            <tr>
              <td className="lbl">(5) 代表者の氏名</td>
              <td colSpan={3}>{fmt(form.rsoRepresentative)}</td>
            </tr>
            <tr>
              <td className="lbl">(6) 登録番号</td>
              <td>{fmt(form.rsoRegNo)}</td>
              <td className="lbl">(7) 登録年月日</td>
              <td>{fmtDate(form.rsoRegDate)}</td>
            </tr>
            <tr>
              <td className="lbl">(8) 支援実施事業所名</td>
              <td colSpan={3}>{fmt(form.rsoSupportBusinessName)}</td>
            </tr>
            <tr>
              <td className="lbl" style={{ paddingLeft: "12px" }}>支援実施事業所所在地</td>
              <td colSpan={3}>{fmtAddr(form.rsoSupportBusinessAddress)}</td>
            </tr>
            <tr>
              <td className="lbl">(10) 支援責任者</td>
              <td>{fmt(form.rsoSupportManager)}</td>
              <td className="lbl">(11) 支援担当者</td>
              <td>{fmt(form.rsoSupportStaff)}</td>
            </tr>
            <tr>
              <td className="lbl">(12) 対応可能言語</td>
              <td colSpan={3}>{fmt(form.rsoAvailableLanguages)}</td>
            </tr>
            <tr>
              <td className="lbl">(13) 支援委託費用（月額）</td>
              <td colSpan={3}>{form.rsoFeePerMonth ? Number(form.rsoFeePerMonth).toLocaleString() + '円' : '　'}</td>
            </tr>
          </tbody></table>
```

変更後:
```tsx
          <table className="v-tbl"><tbody>
            <tr>
              <td className="lbl" style={{ width: "30%" }}>(1) 名称<br /><span className="bilingual">Name</span></td>
              <td colSpan={3}>{omitFor2Go(is2Go, fmt(form.rsoName))}</td>
            </tr>
            <tr>
              <td className="lbl">(2) 法人番号（13桁）</td>
              <td>{omitFor2Go(is2Go, fmt(form.rsoCorporateNo))}</td>
              <td className="lbl" style={{ width: "25%" }}>(3) 雇用保険番号</td>
              <td>{omitFor2Go(is2Go, fmt(form.rsoInsuranceNo))}</td>
            </tr>
            <tr>
              <td className="lbl">(4) 所在地<br /><span className="bilingual">Address</span></td>
              <td colSpan={3}>{omitFor2Go(is2Go, fmtAddr(form.rsoAddress))}</td>
            </tr>
            <tr>
              <td className="lbl" style={{ paddingLeft: "12px" }}>電話番号</td>
              <td colSpan={3}>{omitFor2Go(is2Go, fmt(form.rsoPhone))}</td>
            </tr>
            <tr>
              <td className="lbl">(5) 代表者の氏名</td>
              <td colSpan={3}>{omitFor2Go(is2Go, fmt(form.rsoRepresentative))}</td>
            </tr>
            <tr>
              <td className="lbl">(6) 登録番号</td>
              <td>{omitFor2Go(is2Go, fmt(form.rsoRegNo))}</td>
              <td className="lbl">(7) 登録年月日</td>
              <td>{omitFor2Go(is2Go, fmtDate(form.rsoRegDate))}</td>
            </tr>
            <tr>
              <td className="lbl">(8) 支援実施事業所名</td>
              <td colSpan={3}>{omitFor2Go(is2Go, fmt(form.rsoSupportBusinessName))}</td>
            </tr>
            <tr>
              <td className="lbl" style={{ paddingLeft: "12px" }}>支援実施事業所所在地</td>
              <td colSpan={3}>{omitFor2Go(is2Go, fmtAddr(form.rsoSupportBusinessAddress))}</td>
            </tr>
            <tr>
              <td className="lbl">(10) 支援責任者</td>
              <td>{omitFor2Go(is2Go, fmt(form.rsoSupportManager))}</td>
              <td className="lbl">(11) 支援担当者</td>
              <td>{omitFor2Go(is2Go, fmt(form.rsoSupportStaff))}</td>
            </tr>
            <tr>
              <td className="lbl">(12) 対応可能言語</td>
              <td colSpan={3}>{omitFor2Go(is2Go, fmt(form.rsoAvailableLanguages))}</td>
            </tr>
            <tr>
              <td className="lbl">(13) 支援委託費用（月額）</td>
              <td colSpan={3}>{omitFor2Go(is2Go, form.rsoFeePerMonth ? Number(form.rsoFeePerMonth).toLocaleString() + '円' : '　')}</td>
            </tr>
          </tbody></table>
```

- [ ] **Step 4: TypeScriptの型チェックを確認する**

Run: `npx tsc --noEmit`
Expected: エラーなし。

- [ ] **Step 5: コミットする**

```bash
git add "src/app/(print)/print/[id]/shinsei-org/page.tsx"
git commit -m "feat: 所属機関用PDFの支援責任者等・登録支援機関に省略表記を適用

特定技能2号を選択している場合、支援責任者・支援担当者の氏名、
登録支援機関（5）の全項目を「省略」と表示する。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: 所属機関用PDFの(26)に適用する

**Files:**
- Modify: `src/app/(print)/print/[id]/shinsei-org/page.tsx`

- [ ] **Step 1: コンプライアンス確認(22)〜(31)の配列に(26)専用のomitフラグを追加する**

(26)は他の(22)〜(31)と同じ配列・同じ`.map()`でレンダリングされているため、(26)のエントリのみに`omit`フラグを追加し、レンダリング側でフラグを見て分岐させる。

変更前:
```tsx
            {([
              { has: form.orgGangsterControl, detail: form.orgGangsterControlDetail, label: "(22) 暴力団員等がその事業活動を支配する者に該当するか", en: "Business controlled by organized crime" },
              { has: form.orgActivityDocumentKept, detail: null, label: "(23) 特定技能外国人の活動の内容に係る文書を作成し，特定技能雇用契約の終了の日から1年以上保存することとしているか", en: "Retention of activity documents for 1+ year" },
              { has: form.orgAwareOfDeposit, detail: form.orgAwareOfDepositDetail, label: "(24) 保証金の徴収その他財産の管理を受けていること又は違約金を定める契約を締結していることを認識して雇用契約を締結していないか", en: "Awareness of deposit/penalty contracts" },
              { has: form.orgPenaltyContractExists, detail: form.orgPenaltyContractDetail, label: "(25) 特定技能雇用契約の不履行について違約金を定める契約等を締結していないか", en: "Penalty contract for non-performance" },
              { has: form.orgSupportCostNotBurdened, detail: null, label: "(26) 1号特定技能外国人支援に要する費用を，直接又は間接に外国人に負担させないこととしているか（特定技能1号の場合）", en: "Support costs not charged to worker" },
              { has: form.orgDispatchMeetsCondition, detail: form.orgDispatchConditionDetail, label: "(27) 労働者派遣の場合，派遣先が法定の要件のいずれかに該当すること", en: "Dispatch destination meets legal requirements" },
              { has: form.orgDispatchMeetsCompliance, detail: form.orgDispatchComplianceDetail, label: "(28) 労働者派遣の場合，派遣先が(11)〜(22)に該当しないこと", en: "Dispatch destination compliance" },
              { has: form.orgAccidentInsurance, detail: form.orgAccidentInsuranceDetail, label: "(29) 労災保険関係の成立の届出等の措置を講じていること", en: "Workers' compensation insurance" },
              { has: form.orgContinuousPerformance, detail: null, label: "(30) 特定技能雇用契約を継続して履行する体制が適切に整備されていること", en: "Continuous contract performance system" },
              { has: form.orgSalaryPaymentVerifiable, detail: null, label: "(31) 外国人の報酬を，当該外国人の指定する銀行その他の金融機関に対する振込み又は現実に支払われた額を確認できる方法によって支払われることとしており，かつ，後者の場合には，出入国在留管理庁長官に報酬の支払を裏付ける客観的な資料を提出し，その確認を受けることとしていることの有無", en: "Remuneration paid by wire transfer or verifiable method" },
            ] as const).map((item, i) => (
              <tr key={i}>
                <td className="lbl lbl-wrap" style={{ width: "82%", fontSize: "8.5px", lineHeight: "1.25" }}>
                  {item.label}
                  <span className="bilingual-block">{item.en}</span>
                </td>
                <td style={{ textAlign: "center", width: "18%", fontSize: "9.5px" }}>
                  {fmtYesNo(item.has)}
                  {yes(item.has) && item.detail ? (
                    <><br /><span style={{ fontSize: "8px", color: "#333" }}>{item.detail}</span></>
                  ) : null}
                </td>
              </tr>
            ))}
```

変更後:
```tsx
            {([
              { has: form.orgGangsterControl, detail: form.orgGangsterControlDetail, label: "(22) 暴力団員等がその事業活動を支配する者に該当するか", en: "Business controlled by organized crime", omit: false },
              { has: form.orgActivityDocumentKept, detail: null, label: "(23) 特定技能外国人の活動の内容に係る文書を作成し，特定技能雇用契約の終了の日から1年以上保存することとしているか", en: "Retention of activity documents for 1+ year", omit: false },
              { has: form.orgAwareOfDeposit, detail: form.orgAwareOfDepositDetail, label: "(24) 保証金の徴収その他財産の管理を受けていること又は違約金を定める契約を締結していることを認識して雇用契約を締結していないか", en: "Awareness of deposit/penalty contracts", omit: false },
              { has: form.orgPenaltyContractExists, detail: form.orgPenaltyContractDetail, label: "(25) 特定技能雇用契約の不履行について違約金を定める契約等を締結していないか", en: "Penalty contract for non-performance", omit: false },
              { has: form.orgSupportCostNotBurdened, detail: null, label: "(26) 1号特定技能外国人支援に要する費用を，直接又は間接に外国人に負担させないこととしているか（特定技能1号の場合）", en: "Support costs not charged to worker", omit: is2Go },
              { has: form.orgDispatchMeetsCondition, detail: form.orgDispatchConditionDetail, label: "(27) 労働者派遣の場合，派遣先が法定の要件のいずれかに該当すること", en: "Dispatch destination meets legal requirements", omit: false },
              { has: form.orgDispatchMeetsCompliance, detail: form.orgDispatchComplianceDetail, label: "(28) 労働者派遣の場合，派遣先が(11)〜(22)に該当しないこと", en: "Dispatch destination compliance", omit: false },
              { has: form.orgAccidentInsurance, detail: form.orgAccidentInsuranceDetail, label: "(29) 労災保険関係の成立の届出等の措置を講じていること", en: "Workers' compensation insurance", omit: false },
              { has: form.orgContinuousPerformance, detail: null, label: "(30) 特定技能雇用契約を継続して履行する体制が適切に整備されていること", en: "Continuous contract performance system", omit: false },
              { has: form.orgSalaryPaymentVerifiable, detail: null, label: "(31) 外国人の報酬を，当該外国人の指定する銀行その他の金融機関に対する振込み又は現実に支払われた額を確認できる方法によって支払われることとしており，かつ，後者の場合には，出入国在留管理庁長官に報酬の支払を裏付ける客観的な資料を提出し，その確認を受けることとしていることの有無", en: "Remuneration paid by wire transfer or verifiable method", omit: false },
            ] as const).map((item, i) => (
              <tr key={i}>
                <td className="lbl lbl-wrap" style={{ width: "82%", fontSize: "8.5px", lineHeight: "1.25" }}>
                  {item.label}
                  <span className="bilingual-block">{item.en}</span>
                </td>
                <td style={{ textAlign: "center", width: "18%", fontSize: "9.5px" }}>
                  {item.omit ? "省略" : (
                    <>
                      {fmtYesNo(item.has)}
                      {yes(item.has) && item.detail ? (
                        <><br /><span style={{ fontSize: "8px", color: "#333" }}>{item.detail}</span></>
                      ) : null}
                    </>
                  )}
                </td>
              </tr>
            ))}
```

- [ ] **Step 2: TypeScriptの型チェックを確認する**

Run: `npx tsc --noEmit`
Expected: エラーなし。

- [ ] **Step 3: コミットする**

```bash
git add "src/app/(print)/print/[id]/shinsei-org/page.tsx"
git commit -m "feat: 所属機関用PDFの(26)に特定技能2号の省略表記を適用

(26)は他のコンプライアンス確認項目(22)〜(31)と同じ配列・同じmap()で
レンダリングされているため、(26)のエントリのみにomitフラグを追加し、
特定技能2号の場合のみ「省略」と表示するように分岐させる。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: 所属機関用PDFの(34)〜(42)・支援計画(1)〜(16)に適用する

**Files:**
- Modify: `src/app/(print)/print/[id]/shinsei-org/page.tsx`

- [ ] **Step 1: (34)〜(42)の9セルを変更する**

変更前:
```tsx
          <table className="v-tbl"><tbody>
            <tr>
              <td className="lbl lbl-wrap" style={{ width: "82%", fontSize: "8.5px", lineHeight: "1.25" }}>(34) 役員又は職員の中から支援責任者を選任していることの有無</td>
              <td style={{ textAlign: "center", width: "18%", fontSize: "9.5px" }}>{fmtYesNo(form.supportManagerAppointed)}</td>
            </tr>
            <tr>
              <td className="lbl lbl-wrap" style={{ fontSize: "8.5px", lineHeight: "1.25" }}>(35) 役員又は職員の中から，活動をさせる事業所ごとに1名以上の支援担当者を選任していることの有無</td>
              <td style={{ textAlign: "center", fontSize: "9.5px" }}>{fmtYesNo(form.supportStaffAppointed)}</td>
            </tr>
            <tr>
              <td className="lbl lbl-wrap" style={{ fontSize: "8.5px", lineHeight: "1.25" }}>
                (36) 中長期在留者の受入れ・管理実績等のいずれかに該当することの有無
                {yes(form.supportExperienceCriteria) && (
                  <div style={{ fontSize: "8px", color: "#333", marginTop: "2px" }}>
                    {form.supportExperienceCriteriaItem1 && <>①受入れ・管理実績　</>}
                    {form.supportExperienceCriteriaItem2 && <>②生活相談等の従事経験　</>}
                    {form.supportExperienceCriteriaItem3 && <>③その他（{fmt(form.supportExperienceCriteriaItem3Detail)}）</>}
                  </div>
                )}
              </td>
              <td style={{ textAlign: "center", fontSize: "9.5px" }}>{fmtYesNo(form.supportExperienceCriteria)}</td>
            </tr>
            <tr>
              <td className="lbl lbl-wrap" style={{ fontSize: "8.5px", lineHeight: "1.25" }}>(37) 1号特定技能外国人支援計画に基づく支援を，外国人が十分に理解することができる言語によって行うことができる体制を有していることの有無</td>
              <td style={{ textAlign: "center", fontSize: "9.5px" }}>{fmtYesNo(form.supportLanguageCapability)}</td>
            </tr>
            <tr>
              <td className="lbl lbl-wrap" style={{ fontSize: "8.5px", lineHeight: "1.25" }}>(38) 1号特定技能外国人支援の状況に関する文書を作成し，1年以上備えて置くこととしていることの有無</td>
              <td style={{ textAlign: "center", fontSize: "9.5px" }}>{fmtYesNo(form.supportDocumentKept)}</td>
            </tr>
            <tr>
              <td className="lbl lbl-wrap" style={{ fontSize: "8.5px", lineHeight: "1.25" }}>(39) 支援責任者及び支援担当者が，1号特定技能外国人支援計画の中立な実施を行うことができる立場の者であることの有無</td>
              <td style={{ textAlign: "center", fontSize: "9.5px" }}>{fmtYesNo(form.supportNeutralPosition)}</td>
            </tr>
            <tr>
              <td className="lbl lbl-wrap" style={{ width: "82%", fontSize: "8.5px", lineHeight: "1.25" }}>(40) 特定技能雇用契約締結の日前5年以内又は契約締結の日以後に適合1号特定技能外国人支援計画に基づく支援を怠ったことの有無</td>
              <td style={{ textAlign: "center", width: "18%", fontSize: "9.5px" }}>
                {fmtYesNo(form.supportFailureHistory)}
                {yes(form.supportFailureHistory) && form.supportFailureHistoryDetail ? (
                  <><br /><span style={{ fontSize: "8px", color: "#333" }}>{form.supportFailureHistoryDetail}</span></>
                ) : null}
              </td>
            </tr>
            <tr>
              <td className="lbl lbl-wrap" style={{ fontSize: "8.5px", lineHeight: "1.25" }}>(41) 支援責任者又は支援担当者が外国人及びその監督をする立場にある者と定期的な面談を実施できる体制を有していることの有無</td>
              <td style={{ textAlign: "center", fontSize: "9.5px" }}>{fmtYesNo(form.supportPeriodicInterviewCapability)}</td>
            </tr>
            <tr>
              <td className="lbl lbl-wrap" style={{ fontSize: "8.5px", lineHeight: "1.25" }}>(42) 適合1号特定技能外国人支援計画の適正な実施の確保につき特定産業分野に特有の事情に鑑みて告示で定められる基準に適合していることの有無（当該基準が定められている場合に記入）</td>
              <td style={{ textAlign: "center", fontSize: "9.5px" }}>{fmtYesNo(form.supportImplementationFieldCriteria)}</td>
            </tr>
          </tbody></table>
```

変更後:
```tsx
          <table className="v-tbl"><tbody>
            <tr>
              <td className="lbl lbl-wrap" style={{ width: "82%", fontSize: "8.5px", lineHeight: "1.25" }}>(34) 役員又は職員の中から支援責任者を選任していることの有無</td>
              <td style={{ textAlign: "center", width: "18%", fontSize: "9.5px" }}>{omitFor2Go(is2Go, fmtYesNo(form.supportManagerAppointed))}</td>
            </tr>
            <tr>
              <td className="lbl lbl-wrap" style={{ fontSize: "8.5px", lineHeight: "1.25" }}>(35) 役員又は職員の中から，活動をさせる事業所ごとに1名以上の支援担当者を選任していることの有無</td>
              <td style={{ textAlign: "center", fontSize: "9.5px" }}>{omitFor2Go(is2Go, fmtYesNo(form.supportStaffAppointed))}</td>
            </tr>
            <tr>
              <td className="lbl lbl-wrap" style={{ fontSize: "8.5px", lineHeight: "1.25" }}>
                (36) 中長期在留者の受入れ・管理実績等のいずれかに該当することの有無
                {!is2Go && yes(form.supportExperienceCriteria) && (
                  <div style={{ fontSize: "8px", color: "#333", marginTop: "2px" }}>
                    {form.supportExperienceCriteriaItem1 && <>①受入れ・管理実績　</>}
                    {form.supportExperienceCriteriaItem2 && <>②生活相談等の従事経験　</>}
                    {form.supportExperienceCriteriaItem3 && <>③その他（{fmt(form.supportExperienceCriteriaItem3Detail)}）</>}
                  </div>
                )}
              </td>
              <td style={{ textAlign: "center", fontSize: "9.5px" }}>{omitFor2Go(is2Go, fmtYesNo(form.supportExperienceCriteria))}</td>
            </tr>
            <tr>
              <td className="lbl lbl-wrap" style={{ fontSize: "8.5px", lineHeight: "1.25" }}>(37) 1号特定技能外国人支援計画に基づく支援を，外国人が十分に理解することができる言語によって行うことができる体制を有していることの有無</td>
              <td style={{ textAlign: "center", fontSize: "9.5px" }}>{omitFor2Go(is2Go, fmtYesNo(form.supportLanguageCapability))}</td>
            </tr>
            <tr>
              <td className="lbl lbl-wrap" style={{ fontSize: "8.5px", lineHeight: "1.25" }}>(38) 1号特定技能外国人支援の状況に関する文書を作成し，1年以上備えて置くこととしていることの有無</td>
              <td style={{ textAlign: "center", fontSize: "9.5px" }}>{omitFor2Go(is2Go, fmtYesNo(form.supportDocumentKept))}</td>
            </tr>
            <tr>
              <td className="lbl lbl-wrap" style={{ fontSize: "8.5px", lineHeight: "1.25" }}>(39) 支援責任者及び支援担当者が，1号特定技能外国人支援計画の中立な実施を行うことができる立場の者であることの有無</td>
              <td style={{ textAlign: "center", fontSize: "9.5px" }}>{omitFor2Go(is2Go, fmtYesNo(form.supportNeutralPosition))}</td>
            </tr>
            <tr>
              <td className="lbl lbl-wrap" style={{ width: "82%", fontSize: "8.5px", lineHeight: "1.25" }}>(40) 特定技能雇用契約締結の日前5年以内又は契約締結の日以後に適合1号特定技能外国人支援計画に基づく支援を怠ったことの有無</td>
              <td style={{ textAlign: "center", width: "18%", fontSize: "9.5px" }}>
                {omitFor2Go(is2Go, fmtYesNo(form.supportFailureHistory))}
                {!is2Go && yes(form.supportFailureHistory) && form.supportFailureHistoryDetail ? (
                  <><br /><span style={{ fontSize: "8px", color: "#333" }}>{form.supportFailureHistoryDetail}</span></>
                ) : null}
              </td>
            </tr>
            <tr>
              <td className="lbl lbl-wrap" style={{ fontSize: "8.5px", lineHeight: "1.25" }}>(41) 支援責任者又は支援担当者が外国人及びその監督をする立場にある者と定期的な面談を実施できる体制を有していることの有無</td>
              <td style={{ textAlign: "center", fontSize: "9.5px" }}>{omitFor2Go(is2Go, fmtYesNo(form.supportPeriodicInterviewCapability))}</td>
            </tr>
            <tr>
              <td className="lbl lbl-wrap" style={{ fontSize: "8.5px", lineHeight: "1.25" }}>(42) 適合1号特定技能外国人支援計画の適正な実施の確保につき特定産業分野に特有の事情に鑑みて告示で定められる基準に適合していることの有無（当該基準が定められている場合に記入）</td>
              <td style={{ textAlign: "center", fontSize: "9.5px" }}>{omitFor2Go(is2Go, fmtYesNo(form.supportImplementationFieldCriteria))}</td>
            </tr>
          </tbody></table>
```

（(36)・(40)の補足テキスト表示は`!is2Go &&`を追加し、「省略」表示時に矛盾する補足テキストが出ないようにする。）

- [ ] **Step 2: 支援計画(1)〜(16)の`.map()`を変更する**

変更前:
```tsx
            {([
              { has: form.supportPlanInfoProvision, label: "(1) 在留に当たって留意すべき事項に関する情報提供（十分に理解できる言語）" },
              { has: form.supportPlanInfoProvisionMethod, label: "(2) (1)を対面又はテレビ電話装置その他の方法により実施" },
              { has: form.supportPlanAirportTransfer, label: "(3) 出入国時の港又は飛行場への送迎" },
              { has: form.supportPlanHousingSupport, label: "(4) 適切な住居の確保に係る支援" },
              { has: form.supportPlanLifeContractSupport, label: "(5) 預金口座等の開設・携帯電話契約等の生活に必要な契約に係る支援" },
              { has: form.supportPlanLivingInfoProvision, label: "(6) 在留資格変更後の生活一般・各種手続・相談連絡先等に関する情報提供（十分に理解できる言語）" },
              { has: form.supportPlanProcedureAccompany, label: "(7) 国又は地方公共団体の機関への届出等の手続への同行その他必要な措置" },
              { has: form.supportPlanJapaneseLearning, label: "(8) 日本語を学習する機会の提供" },
              { has: form.supportPlanConsultationResponse, label: "(9) 相談又は苦情への遅滞ない適切な対応・必要な措置（十分に理解できる言語）" },
              { has: form.supportPlanExchangePromotion, label: "(10) 外国人と日本人の交流の促進に係る支援" },
              { has: form.supportPlanJobChangeSupport, label: "(11) 責めに帰すべき事由によらない契約解除の場合の転職支援" },
              { has: form.supportPlanPeriodicInterview, label: "(12) 支援責任者又は支援担当者による定期的な面談・問題発生時の関係行政機関への通報" },
              { has: form.supportPlanCopyProvided, label: "(13) 支援計画を日本語及び外国人が理解できる言語で作成し写しを交付" },
              { has: form.supportPlanFieldSpecificMatters, label: "(14) 特定産業分野に特有の事情に鑑みて告示で定められる事項の記載（当該事項が定められている場合）" },
              { has: form.supportPlanContentAppropriate, label: "(15) 支援内容が外国人の適正な在留に資し，適切に実施できるものであること" },
              { has: form.supportPlanFieldSpecificCriteria, label: "(16) 特定産業分野に特有の事情に鑑みて告示で定められる基準への適合（当該基準が定められている場合）" },
            ] as const).map((item, i) => (
              <tr key={i}>
                <td className="lbl lbl-wrap" style={{ width: "82%", fontSize: "8.5px", lineHeight: "1.25" }}>{item.label}</td>
                <td style={{ textAlign: "center", width: "18%", fontSize: "9.5px" }}>{fmtYesNo(item.has)}</td>
```

変更後（最後の行のみ変更、配列の内容は一切変更しない）:
```tsx
            {([
              { has: form.supportPlanInfoProvision, label: "(1) 在留に当たって留意すべき事項に関する情報提供（十分に理解できる言語）" },
              { has: form.supportPlanInfoProvisionMethod, label: "(2) (1)を対面又はテレビ電話装置その他の方法により実施" },
              { has: form.supportPlanAirportTransfer, label: "(3) 出入国時の港又は飛行場への送迎" },
              { has: form.supportPlanHousingSupport, label: "(4) 適切な住居の確保に係る支援" },
              { has: form.supportPlanLifeContractSupport, label: "(5) 預金口座等の開設・携帯電話契約等の生活に必要な契約に係る支援" },
              { has: form.supportPlanLivingInfoProvision, label: "(6) 在留資格変更後の生活一般・各種手続・相談連絡先等に関する情報提供（十分に理解できる言語）" },
              { has: form.supportPlanProcedureAccompany, label: "(7) 国又は地方公共団体の機関への届出等の手続への同行その他必要な措置" },
              { has: form.supportPlanJapaneseLearning, label: "(8) 日本語を学習する機会の提供" },
              { has: form.supportPlanConsultationResponse, label: "(9) 相談又は苦情への遅滞ない適切な対応・必要な措置（十分に理解できる言語）" },
              { has: form.supportPlanExchangePromotion, label: "(10) 外国人と日本人の交流の促進に係る支援" },
              { has: form.supportPlanJobChangeSupport, label: "(11) 責めに帰すべき事由によらない契約解除の場合の転職支援" },
              { has: form.supportPlanPeriodicInterview, label: "(12) 支援責任者又は支援担当者による定期的な面談・問題発生時の関係行政機関への通報" },
              { has: form.supportPlanCopyProvided, label: "(13) 支援計画を日本語及び外国人が理解できる言語で作成し写しを交付" },
              { has: form.supportPlanFieldSpecificMatters, label: "(14) 特定産業分野に特有の事情に鑑みて告示で定められる事項の記載（当該事項が定められている場合）" },
              { has: form.supportPlanContentAppropriate, label: "(15) 支援内容が外国人の適正な在留に資し，適切に実施できるものであること" },
              { has: form.supportPlanFieldSpecificCriteria, label: "(16) 特定産業分野に特有の事情に鑑みて告示で定められる基準への適合（当該基準が定められている場合）" },
            ] as const).map((item, i) => (
              <tr key={i}>
                <td className="lbl lbl-wrap" style={{ width: "82%", fontSize: "8.5px", lineHeight: "1.25" }}>{item.label}</td>
                <td style={{ textAlign: "center", width: "18%", fontSize: "9.5px" }}>{omitFor2Go(is2Go, fmtYesNo(item.has))}</td>
```

（この配列の項目は全て支援計画(1)〜(16)であり、すべてが特定技能2号で省略対象のため、`(26)`のような個別`omit`フラグは不要。`.map()`の最後の表示セルのみを`omitFor2Go`でラップすれば、配列内の全項目に一律で適用される。）

- [ ] **Step 3: TypeScriptの型チェックを確認する**

Run: `npx tsc --noEmit`
Expected: エラーなし。

- [ ] **Step 4: コミットする**

```bash
git add "src/app/(print)/print/[id]/shinsei-org/page.tsx"
git commit -m "feat: 所属機関用PDFの(34)〜(42)・支援計画(1)〜(16)に省略表記を適用

特定技能2号を選択している場合、(34)〜(42)・支援計画(1)〜(16)の
全項目を「省略」と表示する。(36)・(40)の補足テキストは、省略表示と
矛盾しないよう特定技能2号の場合は表示しないようにする。

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

Expected: 全ルートがエラーなくビルドされる。

- [ ] **Step 2: 手動機能テストの確認項目を整理する（実際の確認はユーザーに依頼）**

1. 特定技能2号を選択した案件で申請人用PDFを開き、項目19（証明方法・試験名①②・試験地①②の全セル）・項目21（通算在留期間）が全て「省略」と表示されることを確認する。
2. 同案件で所属機関用PDFを開き、支援責任者・支援担当者氏名、(26)、(34)〜(42)、支援計画(1)〜(16)、登録支援機関(1)〜(13)の全セルが「省略」と表示されることを確認する。
3. 特定技能1号を選択した同種の案件で両PDFを開き、上記の欄が従来通り入力値（または空欄）で表示されることを確認する（回帰確認）。
4. V型以外の在留資格区分の案件で両PDFを開き、出力内容に変化がないことを確認する。
5. 特定技能2号の案件で、PDFが最後まで正常にダウンロードできること（途中でレイアウト崩れ等が起きないこと）を確認する。

- [ ] **Step 3: featureブランチにpushする**

```bash
git push origin feature/pdf-split-and-org-master
```

- [ ] **Step 4: 本番環境にデプロイする**

```bash
npx vercel --prod
```

- [ ] **Step 5: ユーザーに報告する**

Step2で整理した手動テスト項目（実際の確認はユーザー自身に依頼する旨を明記）と、入力フォーム側の「記載不要」手動トグルはDBに保存されないためPDFには反映されない（自動判定のis2Goのみ反映される）ことを報告する。

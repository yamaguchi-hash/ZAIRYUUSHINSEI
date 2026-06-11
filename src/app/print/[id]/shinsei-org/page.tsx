/**
 * 所属機関等作成用 PDF（計4ページ）
 * ─────────────────────────────────
 * Page 1: 所属機関等作成用 １ V — 雇用契約・所属機関
 * Page 2: 所属機関等作成用 2 V — 派遣先・職業紹介事業者・取次機関
 * Page 3: 所属機関等作成用 3 V — コンプライアンス確認（(11)〜(21)）
 * Page 4: 所属機関等作成用 4 V — コンプライアンス確認（(22)〜(33)）＋ 所属機関署名
 */
import { notFound } from "next/navigation";
import {
  loadShinseiData, PRINT_STYLES,
  fmt, fmtDate, fmtMoney, fmtAddr, fmtSex, fmtYesNo, yes,
  fmtAdditionalOccupations, buildAddress,
  FormHeader, SignatureSection,
} from "../shinsei-shared";
import { ShinseiPrintToolbar } from "../shinsei-print-toolbar";

export default async function ShinseiOrgPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadShinseiData(id);
  if (!data) notFound();

  const { app, applicant, org, form, familyMembers, workHistory, today, isChange } = data;

  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <title>所属機関等作成用 - {fmt(form.orgName)}</title>
        <style>{PRINT_STYLES}</style>
      </head>
      <body>
        <ShinseiPrintToolbar applicationId={id} label="所属機関等作成用（4ページ）" />

        {/* ══════════════════════════════════════════════════════════════════════
            Page 1: 所属機関等作成用 １ V — 雇用契約・所属機関
            ════════════════════════════════════════════════════════════════════ */}
        <div className="page">
          <FormHeader
            partLabel="所属機関等作成用　１"
            partLabelV="Ｖ（「特定技能（１号）」・「特定技能（２号）」）"
            partLabelEn={`For organization, Part 1 V ("Specified Skilled Worker (i)" / "Specified Skilled Worker (ii)")`}
          />

          {/* 1. 雇用している外国人の氏名 */}
          <div className="item-title">
            1 雇用している外国人の氏名
            <span className="bilingual">　Name of the foreign national employed</span>
          </div>
          <table className="v-tbl"><tbody>
            <tr><td colSpan={4}>{fmt(form.familyNameEn)} {fmt(form.givenNameEn)}</td></tr>
          </tbody></table>

          {/* 2. 特定技能雇用契約 */}
          <div className="item-title">
            2 特定技能雇用契約
            <span className="bilingual">　Employment contract for specified skilled worker</span>
          </div>
          <table className="v-tbl"><tbody>
            <tr>
              <td className="lbl" style={{ width: "30%" }}>(1) 雇用契約期間<br /><span className="bilingual">Contract period</span></td>
              <td colSpan={3}>{fmt(form.orgContractStartDate)} 〜 {fmt(form.orgContractEndDate)}</td>
            </tr>
            <tr>
              <td className="lbl">(2) 従事すべき業務の内容<br /><span className="bilingual">Description of work</span></td>
              <td colSpan={3}>&nbsp;</td>
            </tr>
            <tr>
              <td className="lbl" style={{ paddingLeft: "12px" }}>特定産業分野<br /><span className="bilingual">Specified industrial field</span></td>
              <td>{fmt(form.orgSpecifiedIndustrialField)}</td>
              <td className="lbl" style={{ width: "20%" }}>業務区分<br /><span className="bilingual">Work category</span></td>
              <td>{fmt(form.orgWorkCategory)}</td>
            </tr>
            <tr>
              <td className="lbl" style={{ paddingLeft: "12px" }}>主たる職種番号</td>
              <td>{fmt(form.orgOccupationNumber)}</td>
              <td className="lbl">追加職種番号</td>
              <td>{fmtAdditionalOccupations(form.orgOccupationNumberAdditional)}</td>
            </tr>
            <tr>
              <td className="lbl">(3) 所定労働時間（週平均）<br /><span className="bilingual">Working hours (weekly)</span></td>
              <td>{fmt(form.orgWorkHoursWeekly)}時間</td>
              <td className="lbl">月平均</td>
              <td>{fmt(form.orgWorkHoursMonthly)}時間</td>
            </tr>
            <tr>
              <td className="lbl lbl-wrap" colSpan={3} style={{ paddingLeft: "12px" }}>
                所定労働時間が通常の労働者の所定労働時間と同等であることの有無
                <span className="bilingual-block">Whether working hours are equivalent to regular workers</span>
              </td>
              <td>{fmtYesNo(form.orgWorkHoursEquivalent)}</td>
            </tr>
            <tr>
              <td className="lbl">(4) 月額報酬<br /><span className="bilingual">Monthly remuneration</span></td>
              <td>{form.salary ? Number(form.salary).toLocaleString() + '円' : '　'}</td>
              <td className="lbl">基本給の時間換算額</td>
              <td>{form.orgTimeConvertedBasicSalary ? Number(form.orgTimeConvertedBasicSalary).toLocaleString() + '円' : '　'}</td>
            </tr>
            <tr>
              <td className="lbl lbl-wrap" style={{ paddingLeft: "12px" }}>日本人の月額報酬</td>
              <td>{form.orgJapaneseEquivalentSalary ? Number(form.orgJapaneseEquivalentSalary).toLocaleString() + '円' : '　'}</td>
              <td className="lbl lbl-wrap">日本人同等以上か</td>
              <td>{fmtYesNo(form.orgSalaryEqualToJapanese)}</td>
            </tr>
            <tr>
              <td className="lbl">(5) 報酬の支払方法<br /><span className="bilingual">Method of payment</span></td>
              <td colSpan={3}>{yes(form.orgSalaryPaymentCash) ? '通貨払　' : ''}{yes(form.orgSalaryPaymentBank) ? '口座振込み' : ''}</td>
            </tr>
          </tbody></table>

          {/* 項目(6)〜(11) */}
          <table className="v-tbl"><tbody>
            {([
              { no: "(6)", label: "外国人であることを理由として日本人と異なった待遇としている事項の有無", en: "Different treatment due to foreign nationality", val: fmtYesNo(form.orgForeignTreatmentDifference), detail: form.orgForeignTreatmentDetail },
              { no: "(7)", label: "外国人が一時帰国を希望した場合には，必要な有給休暇を取得させるものとしていることの有無", en: "Paid leave for temporary return", val: fmtYesNo(form.orgPaidHolidayForReturn) },
              { no: "(8)", label: "雇用関係につき特定産業分野に特有の事情に鑑みて告示で定められる基準に適合していることの有無（当該基準が定められている場合に記入）", en: "Compliance with field-specific employment criteria", val: fmtYesNo(form.orgFieldSpecificEmploymentCriteria) },
              { no: "(9)", label: "外国人が特定技能雇用契約終了後の帰国に要する旅費を負担することができないときは，当該旅費を負担するとともに，出国が円滑になされるよう必要な措置を講ずることとしていることの有無", en: "Return travel expenses", val: fmtYesNo(form.orgReturnTravelExpenses) },
              { no: "(10)", label: "外国人の健康の状況その他の生活の状況を把握するために必要な措置を講ずることとしていることの有無", en: "Health and living conditions monitoring", val: fmtYesNo(form.orgHealthCheck) },
              { no: "(11)", label: "外国人の適正な在留に資するために必要な事項につき特定産業分野に特有の事情に鑑みて告示で定められる基準に適合していることの有無（当該基準が定められている場合に記入）", en: "Compliance with proper residence criteria", val: fmtYesNo(form.orgProperResidenceCriteria) },
            ] as { no: string; label: string; en: string; val: string; detail?: string | null | undefined }[]).map((item, i) => (
              <tr key={i}>
                <td className="lbl lbl-wrap" style={{ width: "82%", fontSize: "8.5px", lineHeight: "1.25" }}>
                  {item.no} {item.label}
                  <span className="bilingual-block">{item.en}</span>
                </td>
                <td style={{ textAlign: "center", width: "18%" }}>{item.val}</td>
              </tr>
            ))}
          </tbody></table>

          {/* 3. 特定技能所属機関 */}
          <div className="item-title">
            3 特定技能所属機関
            <span className="bilingual">　Organization employing specified skilled worker</span>
          </div>
          <table className="v-tbl"><tbody>
            <tr>
              <td className="lbl" style={{ width: "30%" }}>(1) 氏名又は名称<br /><span className="bilingual">Name</span></td>
              <td colSpan={3}>{fmt(org?.nameJa) || fmt(form.orgName)}</td>
            </tr>
            <tr>
              <td className="lbl">(2) 法人番号（13桁）<br /><span className="bilingual">Corporate number</span></td>
              <td>{fmt(org?.corporateNumber) || fmt(form.orgCorporateNumber)}</td>
              <td className="lbl" style={{ width: "25%" }}>(3) 雇用保険番号（11桁）</td>
              <td>{fmt(org?.employmentInsuranceNo) || fmt(form.orgEmploymentInsuranceNo)}</td>
            </tr>
            <tr>
              <td className="lbl lbl-wrap">(4) 業種番号</td>
              <td>{fmt(form.orgBusinessTypeCode)}</td>
              <td className="lbl">追加業種番号</td>
              <td>{fmt(form.orgBusinessTypeOtherCode)}</td>
            </tr>
            <tr>
              <td className="lbl">(5) 住所（所在地）<br /><span className="bilingual">Address</span></td>
              <td colSpan={3}>{
                (org?.prefecture || org?.city || org?.addressLine)
                  ? `${org.postalCode ? "〒" + org.postalCode + "　" : ""}${fmt(org?.prefecture)}${fmt(org?.city)}${fmt(org?.addressLine)}`
                  : fmtAddr(form.orgAddress)
              }</td>
            </tr>
            <tr>
              <td className="lbl" style={{ paddingLeft: "12px" }}>電話番号<br /><span className="bilingual">Telephone No.</span></td>
              <td colSpan={3}>{fmt(org?.phone) || fmt(form.orgPhone)}</td>
            </tr>
            <tr>
              <td className="lbl">(6) 資本金<br /><span className="bilingual">Capital</span></td>
              <td>{(org?.capital ?? form.orgCapital) ? Number(org?.capital ?? form.orgCapital).toLocaleString() + '円' : '　'}</td>
              <td className="lbl">(7) 年間売上金額</td>
              <td>{(org?.annualSales ?? form.orgAnnualSales) ? Number(org?.annualSales ?? form.orgAnnualSales).toLocaleString() + '円' : '　'}</td>
            </tr>
            <tr>
              <td className="lbl">(8) 常勤職員数<br /><span className="bilingual">Number of employees</span></td>
              <td>{(org?.employeeCount ?? form.orgEmployeeCount) ? `${org?.employeeCount ?? form.orgEmployeeCount}名` : '　'}</td>
              <td className="lbl">(9) 代表者の氏名<br /><span className="bilingual">Representative</span></td>
              <td>{fmt(org?.representativeName) || fmt(form.position)}</td>
            </tr>
            {form.orgBranchName && (
              <tr>
                <td className="lbl">(10) 勤務させる事業所名</td>
                <td>{fmt(form.orgBranchName)}</td>
                <td className="lbl">所在地</td>
                <td>{fmt(form.activityDetails)}</td>
              </tr>
            )}
          </tbody></table>
          <table className="v-tbl"><tbody>
            <tr>
              <td className="lbl lbl-wrap" style={{ width: "60%" }}>
                健康保険及び厚生年金保険の適用事業所であることの有無
                <span className="bilingual-block">Health and pension insurance coverage</span>
              </td>
              <td style={{ width: "10%", textAlign: "center" }}>{fmtYesNo(form.orgHealthInsuranceMet)}</td>
              <td className="lbl lbl-wrap" style={{ width: "20%" }}>労災・雇用保険</td>
              <td style={{ width: "10%", textAlign: "center" }}>{fmtYesNo(form.orgLaborInsuranceMet)}</td>
            </tr>
            <tr>
              <td className="lbl">労働保険番号（14桁）</td>
              <td colSpan={3}>{fmt(org?.laborInsuranceNo) || fmt(form.orgLaborInsuranceNo)}</td>
            </tr>
          </tbody></table>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            Page 2: 所属機関等作成用 2 V — 派遣先・職業紹介事業者・取次機関
            ════════════════════════════════════════════════════════════════════ */}
        <div className="page">
          <FormHeader
            partLabel="所属機関等作成用　２"
            partLabelV="Ｖ（「特定技能（１号）」・「特定技能（２号）」）"
            partLabelEn={`For organization, Part 2 V ("Specified Skilled Worker (i)" / "Specified Skilled Worker (ii)")`}
          />

          {/* 4. 派遣先 */}
          <div className="item-title">
            4 派遣先（雇用形態が労働者派遣の場合に記入）
            <span className="bilingual">　Dispatch destination (if dispatched labor)</span>
          </div>
          <table className="v-tbl"><tbody>
            <tr>
              <td className="lbl" style={{ width: "30%" }}>(1) 氏名又は名称<br /><span className="bilingual">Name</span></td>
              <td colSpan={3}>{fmt(form.orgVDispatchName)}</td>
            </tr>
            <tr>
              <td className="lbl">(2) 法人番号（13桁）<br /><span className="bilingual">Corporate number</span></td>
              <td>{fmt(form.orgVDispatchCorporateNo)}</td>
              <td className="lbl" style={{ width: "25%" }}>(3) 雇用保険番号</td>
              <td>{fmt(form.orgVDispatchInsuranceNo)}</td>
            </tr>
            <tr>
              <td className="lbl">(4) 住所（所在地）<br /><span className="bilingual">Address</span></td>
              <td colSpan={3}>{fmtAddr(form.orgVDispatchAddress)}</td>
            </tr>
            <tr>
              <td className="lbl" style={{ paddingLeft: "12px" }}>電話番号<br /><span className="bilingual">Telephone No.</span></td>
              <td>{fmt(form.orgVDispatchPhone)}</td>
              <td className="lbl">(5) 代表者の氏名</td>
              <td>{fmt(form.orgVDispatchRepresentative)}</td>
            </tr>
            <tr>
              <td className="lbl">(6) 派遣期間<br /><span className="bilingual">Dispatch period</span></td>
              <td colSpan={3}>{fmt(form.orgVDispatchStartDate)} 〜 {fmt(form.orgVDispatchEndDate)}</td>
            </tr>
          </tbody></table>

          {/* 4-2. 職業紹介事業者 */}
          <div className="item-title" style={{ marginTop: "6px" }}>
            4-2 職業紹介事業者（職業紹介により雇用する場合に記入）
            <span className="bilingual">　Employment placement provider</span>
          </div>
          <table className="v-tbl"><tbody>
            <tr>
              <td className="lbl" style={{ width: "30%" }}>(1) 名称<br /><span className="bilingual">Name</span></td>
              <td colSpan={3}>{fmt(form.orgPlacementProviderName)}</td>
            </tr>
            <tr>
              <td className="lbl">(2) 法人番号（13桁）</td>
              <td>{fmt(form.orgPlacementProviderCorporateNo)}</td>
              <td className="lbl" style={{ width: "25%" }}>(3) 雇用保険番号</td>
              <td>{fmt(form.orgPlacementProviderInsuranceNo)}</td>
            </tr>
            <tr>
              <td className="lbl">(4) 住所（所在地）<br /><span className="bilingual">Address</span></td>
              <td colSpan={3}>{fmtAddr(form.orgPlacementProviderAddress)}</td>
            </tr>
            <tr>
              <td className="lbl" style={{ paddingLeft: "12px" }}>電話番号</td>
              <td>{fmt(form.orgPlacementProviderPhone)}</td>
              <td className="lbl">(5) 許可・届出番号</td>
              <td>{fmt(form.orgPlacementProviderLicenseNo)}</td>
            </tr>
            <tr>
              <td className="lbl">(6) 許可・届出年月日</td>
              <td colSpan={3}>{fmtDate(form.orgPlacementProviderLicenseDate)}</td>
            </tr>
          </tbody></table>

          {/* 4-3. 取次機関 */}
          <div className="item-title" style={{ marginTop: "6px" }}>
            4-3 取次機関
            <span className="bilingual">　Intermediary organization</span>
          </div>
          <table className="v-tbl"><tbody>
            <tr>
              <td className="lbl" style={{ width: "30%" }}>(1) 氏名又は名称<br /><span className="bilingual">Name</span></td>
              <td colSpan={3}>{fmt(form.orgIntermediaryName)}</td>
            </tr>
            <tr>
              <td className="lbl">(2) 住所（所在地）<br /><span className="bilingual">Address</span></td>
              <td colSpan={3}>{fmtAddr(form.orgIntermediaryAddress)}</td>
            </tr>
            <tr>
              <td className="lbl" style={{ paddingLeft: "12px" }}>電話番号<br /><span className="bilingual">Telephone No.</span></td>
              <td colSpan={3}>{fmt(form.orgIntermediaryPhone)}</td>
            </tr>
          </tbody></table>

          {/* 5. 登録支援機関 */}
          <div className="item-title" style={{ marginTop: "8px" }}>
            5 登録支援機関（支援計画の全部を委託する場合）
            <span className="bilingual">　Registered Support Organization</span>
          </div>

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
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            Page 3: 所属機関等作成用 3 V — コンプライアンス確認（(11)〜(21)）
            ════════════════════════════════════════════════════════════════════ */}
        <div className="page">
          <FormHeader
            partLabel="所属機関等作成用　３"
            partLabelV="Ｖ（「特定技能（１号）」・「特定技能（２号）」）"
            partLabelEn={`For organization, Part 3 V ("Specified Skilled Worker (i)" / "Specified Skilled Worker (ii)")`}
          />

          <div className="item-title">
            コンプライアンス確認事項（(11)〜(21)）
            <span className="bilingual">　Compliance check items</span>
          </div>
          <table className="v-tbl"><tbody>
            {([
              { has: form.orgLaborLawViolation, detail: form.orgLaborLawViolationDetail, label: "(11) 労働，社会保険及び租税に関する法令の規定に違反したことの有無", en: "Violation of labor/social insurance/tax laws" },
              { has: form.orgInvoluntaryDismissal, detail: form.orgInvoluntaryDismissalDetail, label: "(12) 特定技能外国人の活動に係る非自発的離職者の発生の有無", en: "Involuntary separation of specified skilled workers" },
              { has: form.orgMissingPerson, detail: form.orgMissingPersonDetail, label: "(13) 特定技能外国人の行方不明者の発生の有無", en: "Missing specified skilled workers" },
              { has: form.orgCriminalPunishment, detail: form.orgCriminalPunishmentDetail, label: "(14) 出入国又は労働関係法令に関する不正行為等を理由とする刑罰の有無", en: "Criminal penalty for immigration/labor violations" },
              { has: form.orgMentalDisability, detail: form.orgMentalDisabilityDetail, label: "(15) 精神の機能の障害により特定技能雇用契約の適正な履行に必要な認知等を適切に行うことができない者に該当するか", en: "Mental disability affecting contract performance" },
              { has: form.orgBankruptcy, detail: form.orgBankruptcyDetail, label: "(16) 破産手続開始の決定を受けて復権を得ない者に該当するか", en: "Bankruptcy without restoration" },
              { has: form.orgTrainingRevoked, detail: form.orgTrainingRevokedDetail, label: "(17) 実習認定の取消しを受けたことの有無（5年以内）", en: "Training certification revoked (within 5 years)" },
              { has: form.orgWasOfficerOfRevoked, detail: form.orgWasOfficerOfRevokedDetail, label: "(18) 実習認定の取消しの処分を受けた者の役員であった者に該当するか（取消しから5年以内）", en: "Was officer of organization whose certification was revoked" },
              { has: form.orgIllegalActFiveYears, detail: form.orgIllegalActFiveYearsDetail, label: "(19) 出入国又は労働に関する法令に関し不正又は著しく不当な行為をしたことの有無（5年以内）", en: "Illegal/unjust acts related to immigration/labor (within 5 years)" },
              { has: form.orgGangsterMember, detail: form.orgGangsterMemberDetail, label: "(20) 暴力団員又は暴力団員でなくなった日から5年を経過しない者に該当するか", en: "Organized crime member" },
              { has: form.orgLegalAgentViolation, detail: form.orgLegalAgentViolationDetail, label: "(21) 未成年者の場合の法定代理人が(14)〜(20)に該当するか", en: "Legal representative of minor falls under (14)-(20)" },
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
          </tbody></table>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            Page 4: 所属機関等作成用 4 V — コンプライアンス(22)〜(33) ＋ 所属機関署名
            ════════════════════════════════════════════════════════════════════ */}
        <div className="page">
          <FormHeader
            partLabel="所属機関等作成用　４"
            partLabelV="Ｖ（「特定技能（１号）」・「特定技能（２号）」）"
            partLabelEn={`For organization, Part 4 V ("Specified Skilled Worker (i)" / "Specified Skilled Worker (ii)")`}
          />

          <div className="item-title">
            コンプライアンス確認事項（(22)〜(33)）
            <span className="bilingual">　Compliance check items (continued)</span>
          </div>
          <table className="v-tbl"><tbody>
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
              { has: form.orgSalaryPaymentVerifiable, detail: null, label: "(31) 報酬を預貯金口座への振込等により支払うこととしていること", en: "Salary payment via bank transfer" },
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
          </tbody></table>

          {/* (32) 共生社会への協力 */}
          <table className="v-tbl" style={{ marginTop: "4px" }}><tbody>
            <tr>
              <td className="lbl lbl-wrap" style={{ width: "82%", fontSize: "8.5px", lineHeight: "1.25" }}>
                (32) 分野横断的な協議会に参加し，必要な協力を行う旨の同意について
                <span className="bilingual-block">Consent to participate in cross-sector council</span>
              </td>
              <td style={{ textAlign: "center", width: "18%" }}>{fmtYesNo(form.orgCoexistenceCooperation)}</td>
            </tr>
            {form.orgCoexistenceWorkplaceCityName && (
              <tr>
                <td className="lbl" style={{ paddingLeft: "12px" }}>勤務地市区町村への協力確認書提出</td>
                <td>{fmt(form.orgCoexistenceWorkplaceCityName)}（{fmtDate(form.orgCoexistenceWorkplaceCityDate)}）</td>
              </tr>
            )}
            {form.orgCoexistenceResidenceCityName && (
              <tr>
                <td className="lbl" style={{ paddingLeft: "12px" }}>住居地市区町村への協力確認書提出</td>
                <td>{fmt(form.orgCoexistenceResidenceCityName)}（{fmtDate(form.orgCoexistenceResidenceCityDate)}）</td>
              </tr>
            )}
          </tbody></table>

          <table className="v-tbl" style={{ marginTop: "4px" }}><tbody>
            <tr>
              <td className="lbl lbl-wrap" style={{ width: "82%", fontSize: "8.5px", lineHeight: "1.25" }}>
                (33) 分野に特有の基準に適合していること（特定産業分野に特有の事情に鑑みて告示で定める基準がある場合）
                <span className="bilingual-block">Compliance with field-specific criteria</span>
              </td>
              <td style={{ textAlign: "center", width: "18%" }}>{fmtYesNo(form.orgFieldSpecificContractCriteria)}</td>
            </tr>
          </tbody></table>

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

          {/* ── 【所属機関署名欄】（共通コンポーネント・自動記名＋角印枠） ── */}
          <SignatureSection
            role="organization"
            orgName={fmt(org?.nameJa) || fmt(form.orgName)}
            representativeTitle={fmt(org?.representativeTitle)}
            representativeName={fmt(org?.representativeName) || fmt(form.position)}
          />
        </div>

      </body>
    </html>
  );
}

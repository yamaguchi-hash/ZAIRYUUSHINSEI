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
import { notFound } from "next/navigation";
import {
  loadShinseiData, PRINT_STYLES,
  fmt, fmtDate, fmtMoney, fmtAddr, fmtSex, fmtYesNo, yes, omitFor2Go,
  fmtAdditionalOccupations, buildAddress, businessTypeLabel,
  FormHeader, SignatureSection, AgentSection,
  FORM_TITLE_MAP, getFormNumber,
} from "../shinsei-shared";
import { ShinseiPrintToolbar } from "../shinsei-print-toolbar";
import { ShinseiMarginControls } from "../shinsei-margin-controls";

export default async function ShinseiOrgPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadShinseiData(id);
  if (!data) notFound();

  const { app, applicant, org, form, familyMembers, workHistory, today, isChange, formType, isCoe, cat, isVtype, isNtype, isRtype, needsOrg, is2Go } = data;

  // COE/Change/Extension の項目番号差異（N型: 派遣先の項目番号）— shinsei.tsx と同一の算出方法
  const orgDispatchNo = isCoe ? 12 : 11;

  // ── ヘッド部分（様式番号・タイトル）: 申請書類の種別に応じて動的に切り替え ──
  const formNumber = getFormNumber(formType, cat);
  const formTitle = FORM_TITLE_MAP[formType];

  return (
    <>
        <meta charSet="utf-8" />
        <title>所属機関等作成用 - {fmt(form.orgName)}</title>
        <style>{PRINT_STYLES}</style>
        <ShinseiPrintToolbar applicationId={id} label="所属機関等作成用（5ページ）" disableAutoPrint />
        <ShinseiMarginControls initialTopMm={7} initialBottomMm={7} sideMm={9} />

        {!isVtype && !isNtype && !isRtype && !needsOrg && (
          <div className="no-print" style={{ padding: "60px 24px", textAlign: "center", color: "#64748b", fontSize: "14px", lineHeight: "1.8" }}>
            この在留資格区分では、所属機関用・扶養者用の書類は作成されません。<br />
            現在の申請内容では、この書類は出力されません。
          </div>
        )}

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

          <div className="section">所属機関等作成用　Part 1 N　— 機関情報・雇用条件</div>

          <div className="section3">2. 契約形態　／　3. 所属機関等</div>
          <table>
            <tbody>
              <tr>
                <td className="lbl">2. 契約形態</td>
                <td colSpan={3}>{form.contractType === "その他" ? `その他：${fmt(form.contractTypeOther)}` : fmt(form.contractType)}</td>
              </tr>
              <tr>
                <td className="lbl">3. 機関の名称</td><td>{fmt(form.orgName)}</td>
                <td className="lbl">法人番号</td><td>{fmt(form.orgCorporateNumber)}</td>
              </tr>
              <tr>
                <td className="lbl">支店・事業所名</td><td>{fmt(form.orgBranchName)}</td>
                <td className="lbl">雇用保険番号</td><td>{fmt(form.orgEmploymentInsuranceNo)}</td>
              </tr>
              <tr>
                <td className="lbl">業種番号</td>
                <td>
                  {businessTypeLabel(form.orgBusinessTypeCode ?? "")}
                  {form.orgBusinessTypeOtherCode ? `　他：${form.orgBusinessTypeOtherCode}` : ""}
                </td>
                <td className="lbl">所在地</td><td>{fmtAddr(form.orgAddress)}</td>
              </tr>
              <tr>
                <td className="lbl">電話番号</td><td>{fmt(form.orgPhone)}</td>
                <td className="lbl">資本金</td><td>{fmtMoney(form.orgCapital)}</td>
              </tr>
              <tr>
                <td className="lbl">年間売上高</td><td>{fmtMoney(form.orgAnnualSales)}</td>
                <td className="lbl">従業員数（全体）</td><td>{form.orgEmployeeCount ? `${form.orgEmployeeCount}名` : "　"}</td>
              </tr>
              <tr>
                <td className="lbl">うち外国人</td><td>{form.orgForeignEmployeeCount ? `${form.orgForeignEmployeeCount}名` : "　"}</td>
                <td className="lbl">うち技能実習生</td><td>{form.orgTechInternCount ? `${form.orgTechInternCount}名` : "　"}</td>
              </tr>
            </tbody>
          </table>

          {/* 研究室：COEのみ（項目4） */}
          {isCoe && (form.researchRoomName || form.researchRoomProfessor) && (
            <>
              <div className="section3">4. 研究室（高度専門職・研究のみ）</div>
              <table>
                <tbody>
                  <tr>
                    <td className="lbl">研究室名</td><td>{fmt(form.researchRoomName)}</td>
                    <td className="lbl">指導教員氏名</td><td>{fmt(form.researchRoomProfessor)}</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}

          <div className="section3">
            {isCoe ? "5-11." : "4-10."} 就労条件・給与・職種・活動内容
          </div>
          <table>
            <tbody>
              <tr>
                <td className="lbl">{isCoe ? "5." : "4."} 就労予定期間</td>
                <td>{(form.workPeriodFixed === "定めあり" || form.workPeriodFixed?.startsWith("定めあり")) ? `定めあり：${fmt(form.workPeriodDuration)}` : "定めなし"}</td>
                <td className="lbl">{isCoe ? "6." : "5."} 雇用開始予定日</td>
                <td>
                  {fmtDate(form.employmentStartDate)}
                  {form.employmentStartDateStatus ? `（${form.employmentStartDateStatus}）` : ""}
                </td>
              </tr>
              <tr>
                <td className="lbl">{isCoe ? "7." : "6."} 給与・報酬</td>
                <td>{fmtMoney(form.salary)}{form.salaryType ? `（${form.salaryType}）` : ""}</td>
                <td className="lbl">{isCoe ? "8." : "7."} 実務経験年数</td>
                <td>{form.businessExperienceYears ? `${form.businessExperienceYears}年` : "　"}</td>
              </tr>
              <tr>
                <td className="lbl">{isCoe ? "9." : "8."} 職務上の地位</td>
                <td>{form.positionExists === "あり（Yes）" ? `あり：${fmt(form.position)}` : "なし"}</td>
                <td className="lbl">{isCoe ? "10." : "9."} 職種コード</td>
                <td>
                  {fmt(form.occupationCode)}
                  {form.occupationCodeOthers ? ` / 他：${form.occupationCodeOthers}` : ""}
                </td>
              </tr>
            </tbody>
          </table>

          <div className="section3">{isCoe ? "11." : "10."} 活動内容詳細</div>
          <table>
            <tbody>
              <tr>
                <td style={{ whiteSpace: "pre-wrap", lineHeight: "1.3", minHeight: "28px", padding: "3px" }}>
                  {fmt(form.activityDetails)}
                </td>
              </tr>
            </tbody>
          </table>

          {/* ── 【所属機関署名欄】（共通コンポーネント・自動記名＋角印枠） ── */}
          <SignatureSection
            role="organization"
            orgName={fmt(org?.nameJa) || fmt(form.orgName)}
            representativeTitle={fmt(org?.representativeTitle)}
            representativeName={fmt(org?.representativeName) || fmt(form.position)}
          />

          {/* 所属機関 Part 2（派遣先等） */}
          {form.dispatchOrgName && (
            <>
              <div className="section">所属機関等作成用　Part 2 N　— 派遣先等（項目 {orgDispatchNo}）</div>
              <table>
                <tbody>
                  <tr>
                    <td className="lbl">{orgDispatchNo}. 派遣先名称</td><td>{fmt(form.dispatchOrgName)}</td>
                    <td className="lbl">法人番号</td><td>{fmt(form.dispatchOrgCorporateNumber)}</td>
                  </tr>
                  <tr>
                    <td className="lbl">支店・事業所名</td><td>{fmt(form.dispatchOrgBranchName)}</td>
                    <td className="lbl">雇用保険番号</td><td>{fmt(form.dispatchOrgEmploymentInsuranceNo)}</td>
                  </tr>
                  <tr>
                    <td className="lbl">業種コード</td><td>{businessTypeLabel(form.dispatchOrgBusinessTypeCode ?? "")}</td>
                    <td className="lbl">所在地</td><td>{fmt(form.dispatchOrgAddress)}</td>
                  </tr>
                  <tr>
                    <td className="lbl">電話番号</td><td>{fmt(form.dispatchOrgPhone)}</td>
                    <td className="lbl">派遣予定期間</td><td>{fmt(form.dispatchPeriod)}</td>
                  </tr>
                  <tr>
                    <td className="lbl">資本金</td><td>{fmtMoney(form.dispatchOrgCapital)}</td>
                    <td className="lbl">年間売上高</td><td>{fmtMoney(form.dispatchOrgAnnualSales)}</td>
                  </tr>
                </tbody>
              </table>

              {/* ── 【所属機関署名欄】（共通コンポーネント・自動記名＋角印枠） ── */}
              <SignatureSection
                role="organization"
                orgName={fmt(org?.nameJa) || fmt(form.orgName)}
                representativeTitle={fmt(org?.representativeTitle)}
                representativeName={fmt(org?.representativeName) || fmt(form.position)}
              />
            </>
          )}
        </div>
        )}

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

          <div className="section">
            扶養者等作成用　１　Ｒ　—「家族滞在」{isChange ? '在留資格変更用' : '在留期間更新用'}
          </div>

          <div className="section3">1. 扶養している家族（申請人）の氏名及び在留カード番号</div>
          <table>
            <tbody>
              <tr>
                <td className="lbl" style={{width:'30%'}}>(1) 氏名</td>
                <td colSpan={3}>
                  {form.familyNameEn ? `${fmt(form.familyNameEn)} ${fmt(form.givenNameEn)}` : '　'}
                </td>
              </tr>
              <tr>
                <td className="lbl">(2) 在留カード番号</td>
                <td colSpan={3}>{fmt(form.residenceCardNumber)}</td>
              </tr>
            </tbody>
          </table>

          <div className="section3">2. 扶養者</div>
          <table>
            <tbody>
              <tr>
                <td className="lbl" style={{width:'30%'}}>(1) 氏名（ローマ字）</td>
                <td colSpan={3}>
                  {fmt(form.supporterNameEn || [form.supporterFamilyNameEn, form.supporterGivenNameEn].filter(Boolean).join(' '))}
                </td>
              </tr>
              <tr>
                <td className="lbl">(2) 生年月日</td>
                <td>{fmtDate(form.supporterDob)}</td>
                <td className="lbl">(3) 国籍・地域</td>
                <td>{fmt(form.supporterNationality)}</td>
              </tr>
              <tr>
                <td className="lbl">(4) 在留カード番号</td>
                <td colSpan={3}>{fmt(form.supporterResidenceCard)}</td>
              </tr>
              <tr>
                <td className="lbl">(5) 在留資格</td>
                <td>{fmt(form.supporterStatusOfResidence)}</td>
                <td className="lbl">(6) 在留期間</td>
                <td>{fmt(form.supporterPeriodOfStay)}</td>
              </tr>
              <tr>
                <td className="lbl">(7) 在留期間の満了日</td>
                <td colSpan={3}>{fmtDate(form.supporterPeriodExpiry)}</td>
              </tr>
              <tr>
                <td className="lbl">(8) 申請人との関係</td>
                <td colSpan={3}>
                  {(['夫','妻','父','母','養父','養母'] as string[]).map(opt => (
                    <span key={opt} style={{marginRight:'16px'}}>
                      {form.supporterRelationship === opt ? '■' : '□'} {opt}
                    </span>
                  ))}
                  <span>
                    {form.supporterRelationship === 'その他' ? '■' : '□'} その他
                    {form.supporterRelationship === 'その他' && form.supporterRelationshipOther
                      ? `（${form.supporterRelationshipOther}）` : ''}
                  </span>
                </td>
              </tr>
              <tr>
                <td className="lbl">(9) 勤務先名称</td>
                <td>{fmt(form.supporterEmployer)}</td>
                <td className="lbl">(10) 法人番号</td>
                <td>{fmt(form.supporterCorporateNumber)}</td>
              </tr>
              <tr>
                <td className="lbl">(11) 支店・事業所名</td>
                <td colSpan={3}>{fmt(form.supporterBranchName)}</td>
              </tr>
              <tr>
                <td className="lbl">(12) 勤務先所在地</td>
                <td colSpan={3}>{fmtAddr(form.supporterEmployerAddress || form.supporterAddress)}</td>
              </tr>
              <tr>
                <td className="lbl">　　 電話番号</td>
                <td colSpan={3}>{fmt(form.supporterEmployerPhone)}</td>
              </tr>
              <tr>
                <td className="lbl">(13) 年収</td>
                <td colSpan={3}>{form.supporterAnnualIncome ? `${Number(form.supporterAnnualIncome).toLocaleString()} 円` : '　'}</td>
              </tr>
            </tbody>
          </table>

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

          <div className="role-banner">【所属機関用】</div>
          <div className="section">所属機関等作成用</div>
          <table>
            <tbody>
              <tr>
                <td style={{ padding: "8px", whiteSpace: "pre-wrap", lineHeight: "1.7" }}>
                  {form.freeformOrgNotes}
                </td>
              </tr>
            </tbody>
          </table>

          <SignatureSection role="organization"
            orgName={fmt(org?.nameJa) || fmt(form.orgName)}
            representativeTitle={fmt(org?.representativeTitle)}
            representativeName={fmt(org?.representativeName) || fmt(form.position)}
          />
        </div>
        )}

        {isVtype && (
        <>
        {/* ══════════════════════════════════════════════════════════════════════
            Page 1: 所属機関等作成用 １ V — 雇用契約・所属機関
            ════════════════════════════════════════════════════════════════════ */}
        <div className="page">
          <FormHeader
            showGov
            formNumber={formNumber}
            title={formTitle.ja}
            titleEn={formTitle.en}
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
            {form.orgContractRenewal && (
              <tr>
                <td className="lbl lbl-wrap" style={{ paddingLeft: "12px" }}>契約の更新の有無・内容</td>
                <td colSpan={3}>{fmt(form.orgContractRenewal)}</td>
              </tr>
            )}
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
            {(form.orgVWorkplaceName || form.orgVWorkplaceAddress) && (
              <tr>
                <td className="lbl lbl-wrap" style={{ paddingLeft: "12px" }}>就業の場所<br /><span className="bilingual">Place of work</span></td>
                <td colSpan={3}>{fmt(form.orgVWorkplaceName)}{form.orgVWorkplaceName && form.orgVWorkplaceAddress ? "　" : ""}{fmtAddr(form.orgVWorkplaceAddress)}</td>
              </tr>
            )}
            <tr>
              <td className="lbl">(3) 所定労働時間（週平均）<br /><span className="bilingual">Working hours (weekly)</span></td>
              <td>{fmt(form.orgWorkHoursWeekly)}時間</td>
              <td className="lbl">月平均</td>
              <td>{fmt(form.orgWorkHoursMonthly)}時間</td>
            </tr>
            {form.orgWorkDaysWeekly && (
              <tr>
                <td className="lbl lbl-wrap" style={{ paddingLeft: "12px" }}>所定労働日数（週）</td>
                <td colSpan={3}>{fmt(form.orgWorkDaysWeekly)}日</td>
              </tr>
            )}
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
            {form.orgAllowancesDetail && (
              <tr>
                <td className="lbl lbl-wrap" style={{ paddingLeft: "12px" }}>諸手当の内訳</td>
                <td colSpan={3}>{fmt(form.orgAllowancesDetail)}</td>
              </tr>
            )}
            {form.orgMonthlyTotalEstimate && (
              <tr>
                <td className="lbl lbl-wrap" style={{ paddingLeft: "12px" }}>1か月当たりの支払概算額（合計）</td>
                <td colSpan={3}>{fmtMoney(form.orgMonthlyTotalEstimate)}</td>
              </tr>
            )}
            {form.orgSalaryEqualityExplanation && (
              <tr>
                <td className="lbl lbl-wrap" style={{ paddingLeft: "12px" }}>報酬が日本人と同等以上であることの説明</td>
                <td colSpan={3}>{fmt(form.orgSalaryEqualityExplanation)}</td>
              </tr>
            )}
            {(form.orgOvertimeRate || form.orgHolidayRate || form.orgNightShiftRate) && (
              <tr>
                <td className="lbl lbl-wrap" style={{ paddingLeft: "12px" }}>割増賃金率（時間外・休日・深夜）</td>
                <td colSpan={3}>
                  時間外 {fmt(form.orgOvertimeRate)}%　休日 {fmt(form.orgHolidayRate)}%　深夜 {fmt(form.orgNightShiftRate)}%
                </td>
              </tr>
            )}
            <tr>
              <td className="lbl">(5) 報酬の支払方法<br /><span className="bilingual">Method of payment</span></td>
              <td colSpan={3}>{yes(form.orgSalaryPaymentCash) ? '通貨払　' : ''}{yes(form.orgSalaryPaymentBank) ? '口座振込み' : ''}</td>
            </tr>
            {(form.orgSalaryClosingDate || form.orgSalaryPaymentDate) && (
              <tr>
                <td className="lbl lbl-wrap" style={{ paddingLeft: "12px" }}>賃金締切日・支払日</td>
                <td colSpan={3}>{fmt(form.orgSalaryClosingDate)}　{fmt(form.orgSalaryPaymentDate)}</td>
              </tr>
            )}
            {form.orgDeductionItems && (
              <tr>
                <td className="lbl lbl-wrap" style={{ paddingLeft: "12px" }}>賃金支払時の控除項目</td>
                <td colSpan={3}>{fmt(form.orgDeductionItems)}</td>
              </tr>
            )}
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
          {/* 2ページ目以降は様式タイトルの重複表示を避け、Part表記のみ表示する */}
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
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            Page 3: 所属機関等作成用 3 V — コンプライアンス確認（(11)〜(21)）
            ════════════════════════════════════════════════════════════════════ */}
        <div className="page">
          {/* 2ページ目以降は様式タイトルの重複表示を避け、Part表記のみ表示する */}
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
          {/* 2ページ目以降は様式タイトルの重複表示を避け、Part表記のみ表示する */}
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
          </tbody></table>

          {/* (32) 共生社会関係施策への協力 */}
          <table className="v-tbl" style={{ marginTop: "4px" }}><tbody>
            <tr>
              <td className="lbl lbl-wrap" style={{ width: "82%", fontSize: "8.5px", lineHeight: "1.25" }}>
                (32) 特定技能雇用契約の当事者である外国人に関し，地方公共団体からの共生社会関係施策に対する協力要請に対し，必要な協力をすることとしていることの有無
                <span className="bilingual-block">Necessary cooperation for harmonious coexistence measures requested by local governments</span>
              </td>
              <td style={{ textAlign: "center", width: "18%" }}>{fmtYesNo(form.orgCoexistenceCooperation)}</td>
            </tr>
            <tr>
              <td className="lbl lbl-wrap" style={{ paddingLeft: "12px", fontSize: "8.5px", lineHeight: "1.25" }}>
                ○ 当該外国人に活動をさせる事業所の所在地の市町村の長に対する協力確認書の提出の有無
                <span className="bilingual-block">Letter of confirmation of cooperation submitted to the mayor of the municipality of the place of business</span>
              </td>
              <td style={{ textAlign: "center" }}>
                {fmtYesNo(form.orgCoexistenceWorkplaceCity)}
                {yes(form.orgCoexistenceWorkplaceCity) && form.orgCoexistenceWorkplaceCityName ? (
                  <><br /><span style={{ fontSize: "8px", color: "#333" }}>{fmt(form.orgCoexistenceWorkplaceCityName)}（{fmtDate(form.orgCoexistenceWorkplaceCityDate)}）</span></>
                ) : null}
              </td>
            </tr>
            <tr>
              <td className="lbl lbl-wrap" style={{ paddingLeft: "12px", fontSize: "8.5px", lineHeight: "1.25" }}>
                ○ 当該外国人の住居地の市町村の長に対する協力確認書の提出の有無
                <span className="bilingual-block">Letter of confirmation of cooperation submitted to the mayor of the municipality where the foreign national lives</span>
              </td>
              <td style={{ textAlign: "center" }}>
                {fmtYesNo(form.orgCoexistenceResidenceCity)}
                {yes(form.orgCoexistenceResidenceCity) && form.orgCoexistenceResidenceCityName ? (
                  <><br /><span style={{ fontSize: "8px", color: "#333" }}>{fmt(form.orgCoexistenceResidenceCityName)}（{fmtDate(form.orgCoexistenceResidenceCityDate)}）</span></>
                ) : null}
              </td>
            </tr>
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
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            Page 5: 所属機関等作成用 4 V — 1号特定技能外国人支援計画（(34)〜(42)・4(1)〜(16)）＋ 取次者・署名
            ════════════════════════════════════════════════════════════════════ */}
        <div className="page">
          {/* 2ページ目以降は様式タイトルの重複表示を避け、Part表記のみ表示する */}
          <FormHeader
            partLabel="所属機関等作成用　５"
            partLabelV="Ｖ（「特定技能（１号）」・「特定技能（２号）」）"
            partLabelEn={`For organization, Part 4 V ("Specified Skilled Worker (i)" / "Specified Skilled Worker (ii)") — Support plan`}
          />

          <div className="item-title">
            1号特定技能外国人支援計画（(34)〜(42)）
            <span className="bilingual">　Support plan for Specified Skilled Worker (i)</span>
          </div>
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

          <div className="item-title" style={{ marginTop: "6px" }}>
            4　1号特定技能外国人支援計画の内容（(1)〜(16)）
            <span className="bilingual">　Contents of the support plan</span>
          </div>
          <table className="v-tbl"><tbody>
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
              </tr>
            ))}
          </tbody></table>

          {/* ── 取次者 ── */}
          <AgentSection />

          {/* ── 【所属機関署名欄】（共通コンポーネント・自動記名＋角印枠） ── */}
          <SignatureSection
            role="organization"
            orgName={fmt(org?.nameJa) || fmt(form.orgName)}
            representativeTitle={fmt(org?.representativeTitle)}
            representativeName={fmt(org?.representativeName) || fmt(form.position)}
          />
        </div>
        </>
        )}

    </>
  );
}

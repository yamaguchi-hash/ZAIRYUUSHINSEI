/**
 * 申請人等作成用 PDF（計3ページ）
 * ─────────────────────────────────
 * Page 1: 別記第三十号様式（第二十条関係）申請人等作成用 １
 * Page 2: 申請人等作成用 ２ V（「特定技能（１号）」・「特定技能（２号）」）
 * Page 3: 申請人等作成用 ３ V（「特定技能（１号）」・「特定技能（２号）」）
 */
import { notFound } from "next/navigation";
import {
  loadShinseiData, PRINT_STYLES,
  fmt, fmtDate, fmtMoney, fmtAddr, fmtSex, fmtYesNo, yes,
  fmtAdditionalOccupations, buildAddress,
} from "../shinsei-shared";
import { ShinseiPrintToolbar } from "../shinsei-print-toolbar";

export default async function ShinseiApplicantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadShinseiData(id);
  if (!data) notFound();

  const { app, applicant, org, form, familyMembers, workHistory, today, isChange } = data;

  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <title>申請人等作成用 - {form.familyNameEn} {form.givenNameEn}</title>
        <style>{PRINT_STYLES}</style>
      </head>
      <body>
        <ShinseiPrintToolbar applicationId={id} label="申請人等作成用（3ページ）" />

        {/* ══════════════════════════════════════════════════════════════════════
            Page 1: 別記第三十号様式（第二十条関係）申請人等作成用 １
            ════════════════════════════════════════════════════════════════════ */}
        <div className="page" style={{ paddingTop: "50px" }}>
          {/* ── ヘッダー ── */}
          <div className="form-header">
            <div className="gov">日本国政府法務省　Ministry of Justice, Government of Japan</div>
            <div className="form-number">別記第三十号様式（第二十条関係）</div>
            <div className="form-title-box">
              在留資格変更許可申請書
              <div className="form-title-en">APPLICATION FOR CHANGE OF STATUS OF RESIDENCE</div>
            </div>
            <div className="part-label">
              申請人等作成用　１
              <span className="part-label-en">　For applicant, Part 1</span>
            </div>
          </div>

          <p style={{ fontSize: "8px", color: "#333", textAlign: "center", marginBottom: "6px" }}>
            出入国管理及び難民認定法第20条第2項の規定に基づき，次のとおり在留資格の変更を申請します。
            <br />
            <span className="bilingual">
              Pursuant to the provisions of Article 20, Paragraph 2 of the Immigration Control and Refugee Recognition Act, I hereby apply for change of status of residence as follows.
            </span>
          </p>

          {/* ── 基本情報テーブル ── */}
          <table>
            <tbody>
              <tr>
                <td className="lbl" style={{ width: "25%" }}>
                  1 国籍・地域<br /><span className="bilingual">Nationality/Region</span>
                </td>
                <td style={{ width: "25%" }}>{fmt(form.nationality)}</td>
                <td className="lbl" style={{ width: "25%" }}>
                  2 生年月日<br /><span className="bilingual">Date of birth</span>
                </td>
                <td style={{ width: "25%" }}><span className="dob-value">{fmtDate(form.dateOfBirth)}</span></td>
              </tr>
              <tr>
                <td className="lbl">
                  3 氏名<br /><span className="bilingual">Name</span>
                </td>
                <td colSpan={3}>
                  <div style={{ display: "flex", gap: "20px" }}>
                    <div><span className="bilingual">Family name</span><br />{fmt(form.familyNameEn)}</div>
                    <div><span className="bilingual">Given name</span><br />{fmt(form.givenNameEn)}</div>
                  </div>
                </td>
              </tr>
              <tr>
                <td className="lbl">
                  4 性別<br /><span className="bilingual">Sex</span>
                </td>
                <td>{fmtSex(form.sex)}</td>
                <td className="lbl">
                  5 出生地<br /><span className="bilingual">Place of birth</span>
                </td>
                <td>{fmt(form.placeOfBirth)}</td>
              </tr>
              <tr>
                <td className="lbl">
                  6 配偶者の有無<br /><span className="bilingual">Marital status</span>
                </td>
                <td>{form.maritalStatus === "有" ? "有 Married" : "無 Single"}</td>
                <td className="lbl">
                  7 職業<br /><span className="bilingual">Occupation</span>
                </td>
                <td>{fmt(form.occupation)}</td>
              </tr>
              <tr>
                <td className="lbl">
                  8 本国における居住地<br /><span className="bilingual">Home town/city</span>
                </td>
                <td colSpan={3}>{fmt(form.homeTownCity)}</td>
              </tr>
              <tr>
                <td className="lbl">
                  9 住居地<br /><span className="bilingual">Address in Japan</span>
                </td>
                <td colSpan={3}>{buildAddress(form)}</td>
              </tr>
              <tr>
                <td className="lbl" style={{ paddingLeft: "16px" }}>
                  電話番号<br /><span className="bilingual">Telephone No.</span>
                </td>
                <td>{fmt(form.telephoneNo)}</td>
                <td className="lbl" style={{ paddingLeft: "16px" }}>
                  携帯電話番号<br /><span className="bilingual">Cellular phone No.</span>
                </td>
                <td>{fmt(form.cellularPhoneNo)}</td>
              </tr>
              <tr>
                <td className="lbl">
                  10 旅券<br /><span className="bilingual">Passport</span>
                </td>
                <td colSpan={3}>
                  <div style={{ display: "flex", gap: "20px" }}>
                    <div>(1) 番号 <span className="bilingual">Number</span>：{fmt(form.passportNumber)}</div>
                    <div>(2) 有効期限 <span className="bilingual">Date of expiration</span>：{fmtDate(form.passportExpiry)}</div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          {/* ── 在留資格変更固有項目 (11-16) ── */}
          <table>
            <tbody>
              <tr>
                <td className="lbl" style={{ width: "25%" }}>
                  11 現在の在留資格<br /><span className="bilingual">Status of residence</span>
                </td>
                <td style={{ width: "25%" }}>{fmt(form.currentStatusOfResidence)}</td>
                <td className="lbl" style={{ width: "25%" }}>
                  在留期間<br /><span className="bilingual">Period of stay</span>
                </td>
                <td style={{ width: "25%" }}>{fmt(form.currentPeriodOfStay)}</td>
              </tr>
              <tr>
                <td className="lbl">
                  <span style={{ paddingLeft: "8px" }}>在留期間の満了日</span><br /><span className="bilingual" style={{ paddingLeft: "8px" }}>Date of expiration</span>
                </td>
                <td>{fmtDate(form.currentPeriodExpiry)}</td>
                <td className="lbl">
                  12 在留カード番号<br /><span className="bilingual">Residence card number</span>
                </td>
                <td>{fmt(form.residenceCardNumber)}</td>
              </tr>
              <tr>
                <td className="lbl">
                  13 希望する在留資格<br /><span className="bilingual">Desired status of residence</span>
                </td>
                <td>{fmt(form.desiredStatusOfResidence)}</td>
                <td className="lbl">
                  希望する在留期間<br /><span className="bilingual">Desired period of extension</span>
                </td>
                <td>{fmt(form.desiredPeriodOfStay)}</td>
              </tr>
              <tr>
                <td className="lbl">
                  14 変更の理由<br /><span className="bilingual">Reason for change</span>
                </td>
                <td colSpan={3} style={{ whiteSpace: "pre-wrap", minHeight: "28px" }}>{fmt(form.reasonForApplication)}</td>
              </tr>
              <tr>
                <td className="lbl lbl-wrap" style={{ lineHeight: "1.2" }}>
                  15 犯罪を理由とする処分を受けたことの有無
                  <span className="bilingual-block">Criminal record</span>
                </td>
                <td>{yes(form.criminalRecord) ? `有 Yes — ${fmt(form.criminalRecordDetail)}` : "無 No"}</td>
                <td className="lbl lbl-wrap" style={{ lineHeight: "1.2" }}>
                  退去強制又は出国命令による出国の有無
                  <span className="bilingual-block">Departure order</span>
                </td>
                <td>{yes(form.deportationHistory) ? `有 Yes — ${fmt(form.deportationCount)}回` : "無 No"}</td>
              </tr>
            </tbody>
          </table>

          {/* ── 16. 在日親族 ── */}
          <div className="item-title">
            16 在日親族（父・母・配偶者・子・兄弟姉妹等）及び同居者
            <span className="bilingual">　Family in Japan</span>
          </div>
          {familyMembers.length === 0 ? (
            <table><tbody><tr><td style={{ textAlign: "center", color: "#777", padding: "4px", fontSize: "9px" }}>なし（None）</td></tr></tbody></table>
          ) : (
            <table style={{ fontSize: "8.5px" }}>
              <thead>
                <tr>
                  <th style={{ width: "11%" }}>続柄<br /><span className="bilingual">Relationship</span></th>
                  <th style={{ width: "18%" }}>氏名<br /><span className="bilingual">Name</span></th>
                  <th style={{ width: "13%" }}>生年月日<br /><span className="bilingual">Date of birth</span></th>
                  <th style={{ width: "10%" }}>国籍・地域<br /><span className="bilingual">Nationality</span></th>
                  <th style={{ width: "22%" }}>勤務先・通学先<br /><span className="bilingual">Place of employment</span></th>
                  <th style={{ width: "7%" }}>同居<br /><span className="bilingual">Cohabiting</span></th>
                  <th style={{ width: "19%" }}>在留カード番号<br /><span className="bilingual">Residence card No.</span></th>
                </tr>
              </thead>
              <tbody>
                {familyMembers.map((m, i) => (
                  <tr key={i}>
                    <td>{m.relationship}</td><td>{m.name}</td><td><span className="dob-value">{fmtDate(m.dateOfBirth)}</span></td>
                    <td>{m.nationality}</td><td>{m.placeOfEmployment}</td>
                    <td style={{ textAlign: "center" }}>{m.residingTogether ? "○" : "×"}</td>
                    <td>{m.residenceCardNumber}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            Page 2: 申請人等作成用 ２ V（「特定技能（１号）」・「特定技能（２号）」）
            ════════════════════════════════════════════════════════════════════ */}
        <div className="page">
          <div className="form-header">
            <div className="part-label">申請人等作成用　２</div>
            <div className="part-label-v">
              Ｖ（「特定技能（１号）」・「特定技能（２号）」）
            </div>
            <div className="part-label-en" style={{ fontSize: "7.5px" }}>
              For applicant, Part 2 V &nbsp;("Specified Skilled Worker (i)" / "Specified Skilled Worker (ii)")
            </div>
          </div>

          {/* 17. 特定技能所属機関 */}
          <div className="item-title">
            17 申請人を雇用する本邦の公私の機関の名称等
            <span className="bilingual">　Name of the organization in Japan where the applicant is to be employed</span>
          </div>
          <table className="v-tbl"><tbody>
            <tr>
              <td className="lbl" style={{ width: "28%" }}>(1) 氏名又は名称<br /><span className="bilingual">Name</span></td>
              <td colSpan={3}>{fmt(form.employerName)}</td>
            </tr>
            <tr>
              <td className="lbl">(2) 住所（所在地）<br /><span className="bilingual">Address</span></td>
              <td colSpan={3}>{fmtAddr(form.employerAddress)}</td>
            </tr>
            <tr>
              <td className="lbl" style={{ paddingLeft: "12px" }}>電話番号<br /><span className="bilingual">Telephone No.</span></td>
              <td colSpan={3}>{fmt(form.employerPhone)}</td>
            </tr>
          </tbody></table>

          {/* 18. 技能水準 */}
          <div className="item-title">
            18 技能水準に関する事項（該当するものにチェック）
            <span className="bilingual">　Matters related to the skill level</span>
          </div>
          <table className="v-tbl"><tbody>
            <tr>
              <td className="lbl" style={{ width: "28%" }}>証明方法<br /><span className="bilingual">Method of proof</span></td>
              <td colSpan={3}>{fmt(form.skillLevelProofMethod)}</td>
            </tr>
            {form.skillLevelExamName1 && (
              <tr>
                <td className="lbl">試験名①<br /><span className="bilingual">Exam name 1</span></td>
                <td>{fmt(form.skillLevelExamName1)}</td>
                <td className="lbl" style={{ width: "12%" }}>試験地①</td>
                <td>{fmt(form.skillLevelExamCountry1)}{form.skillLevelExamCountry1 === '国外' ? `（${form.skillLevelExamCountryName1}）` : ''}</td>
              </tr>
            )}
            {form.skillLevelExamName2 && (
              <tr>
                <td className="lbl">試験名②<br /><span className="bilingual">Exam name 2</span></td>
                <td>{fmt(form.skillLevelExamName2)}</td>
                <td className="lbl">試験地②</td>
                <td>{fmt(form.skillLevelExamCountry2)}{form.skillLevelExamCountry2 === '国外' ? `（${form.skillLevelExamCountryName2}）` : ''}</td>
              </tr>
            )}
          </tbody></table>

          {/* 19. 日本語能力 */}
          <div className="item-title">
            19 日本語能力に関する事項（「特定技能1号」での在留を希望する場合に記入）
            <span className="bilingual">　Japanese language ability (Fill in for "Specified Skilled Worker (i)")</span>
          </div>
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

          {/* 20. 技能実習2号 */}
          <div className="item-title">
            20 良好に修了した技能実習2号の職種及び作業
            <span className="bilingual">　Technical Intern Training (ii) completed in good standing</span>
          </div>
          {(form.completedTit2Occupation1 || form.completedTit2Occupation2) ? (
            <table className="v-tbl"><tbody>
              <tr>
                <td className="lbl" style={{ width: "13%" }}>職種①</td>
                <td style={{ width: "37%" }}>{fmt(form.completedTit2Occupation1)}</td>
                <td className="lbl" style={{ width: "13%" }}>作業①</td>
                <td style={{ width: "37%" }}>{fmt(form.completedTit2Operations1)}</td>
              </tr>
              <tr><td className="lbl">証明①</td><td colSpan={3}>{fmt(form.completedTit2ProofType1)}</td></tr>
              {form.completedTit2Occupation2 && (<>
                <tr>
                  <td className="lbl">職種②</td><td>{fmt(form.completedTit2Occupation2)}</td>
                  <td className="lbl">作業②</td><td>{fmt(form.completedTit2Operations2)}</td>
                </tr>
                <tr><td className="lbl">証明②</td><td colSpan={3}>{fmt(form.completedTit2ProofType2)}</td></tr>
              </>)}
            </tbody></table>
          ) : (
            <table><tbody><tr><td style={{ textAlign: "center", color: "#777", padding: "3px", fontSize: "8.5px" }}>該当なし</td></tr></tbody></table>
          )}

          {/* 21. 通算在留期間 */}
          <div className="item-title">
            21 1号特定技能外国人としての在留期間
            <span className="bilingual">　Cumulative period of stay as "Specified Skilled Worker (i)"</span>
          </div>
          <table className="v-tbl"><tbody>
            <tr>
              <td className="lbl" style={{ width: "28%" }}>通算在留期間</td>
              <td>
                {form.cumulativeStayYears ? `${form.cumulativeStayYears}年` : ''}
                {form.cumulativeStayMonths ? `${form.cumulativeStayMonths}ヶ月` : ''}
                {!form.cumulativeStayYears && !form.cumulativeStayMonths && ''}
              </td>
            </tr>
          </tbody></table>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            Page 3: 申請人等作成用 ３ V（「特定技能（１号）」・「特定技能（２号）」）
            ════════════════════════════════════════════════════════════════════ */}
        <div className="page">
          <div className="form-header">
            <div className="part-label">申請人等作成用　３</div>
            <div className="part-label-v">
              Ｖ（「特定技能（１号）」・「特定技能（２号）」）
            </div>
            <div className="part-label-en" style={{ fontSize: "7.5px" }}>
              For applicant, Part 3 V &nbsp;("Specified Skilled Worker (i)" / "Specified Skilled Worker (ii)")
            </div>
          </div>

          {/* 確認事項（22〜27） */}
          <table className="v-tbl"><tbody>
            {([
              { no: "22", label: "特定技能雇用契約に係る保証金の徴収その他財産の管理又は違約金等の支払についての契約の締結の有無", en: "Existence of deposit collection or penalty contract", val: fmtYesNo(form.depositContractExists) },
              { no: "23", label: "特定技能雇用契約に係る申込みの取次ぎ又は外国における活動の準備に関し外国の機関に費用を支払っている場合，当該費用の額及び内訳を十分に理解して合意していることの有無", en: "Understanding of expenses paid to foreign agencies", val: `${fmtYesNo(form.overseasExpensesExists)}${form.overseasExpensesExists === '有' ? `（${fmt(form.overseasExpensesOrgName)}、約${fmt(form.overseasExpensesAmount)}円）` : ''}` },
              { no: "24", label: "国籍又は住所を有する国又は地域において，本邦で行う活動に関連して当該国又は地域において遵守すべき手続が定められている場合，当該手続を経ていることの有無", en: "Compliance with procedures in home country", val: fmtYesNo(form.homeCountryProcedureComplied) },
              { no: "25", label: "本邦において定期に負担する費用がある場合，当該費用の対価として提供される食事，住居その他の利益の内容を十分に理解した上で合意しており，かつ，当該費用の額が実費に相当する額その他の適正な額であることの有無", en: "Understanding of regular expenses", val: fmtYesNo(form.regularExpensesUnderstood) },
              { no: "26", label: "技能実習により本邦において修得等した技能等の本国への移転に努めることの有無（技能実習の在留資格をもって在留していたことがある場合であって，「特定技能2号」での在留を希望する場合に記入）", en: "Transfer of skills to home country", val: fmtYesNo(form.technologyTransferEffortV) },
              { no: "27", label: "申請人につき特定産業分野に特有の事情に鑑みて告示で定める基準に適合していることの有無（当該基準が定められている場合に記入）", en: "Compliance with field-specific criteria", val: fmtYesNo(form.ssfSpecificFieldCriteriaMet) },
            ] as const).map((item, i) => (
              <tr key={i}>
                <td className="lbl lbl-wrap" style={{ width: "82%", fontSize: "8.5px", lineHeight: "1.25" }}>
                  {item.no}　{item.label}
                  <span className="bilingual-block">{item.en}</span>
                </td>
                <td style={{ textAlign: "center", width: "18%", fontSize: "9.5px" }}>{item.val}</td>
              </tr>
            ))}
          </tbody></table>

          {/* 28. 職歴 */}
          <div className="item-title">
            28 職歴（外国におけるものを含む。）
            <span className="bilingual">　Employment history (including work experience in foreign countries)</span>
          </div>
          {workHistory.length > 0 && workHistory.some(w => w.employer) ? (
            <table className="v-tbl" style={{ fontSize: "9px" }}><tbody>
              <tr>
                <th style={{ width: "20%" }}>入社年月<br /><span className="bilingual">Date(from)</span></th>
                <th style={{ width: "20%" }}>退社年月<br /><span className="bilingual">Date(to)</span></th>
                <th>勤務先名称<br /><span className="bilingual">Place of employment</span></th>
              </tr>
              {workHistory.filter(w => w.employer).map((w, i) => (
                <tr key={i}><td>{fmt(w.joinDate)}</td><td>{fmt(w.leaveDate)}</td><td>{fmt(w.employer)}</td></tr>
              ))}
            </tbody></table>
          ) : (
            <table><tbody><tr><td style={{ textAlign: "center", color: "#777", padding: "3px", fontSize: "8.5px" }}>なし</td></tr></tbody></table>
          )}

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

          {/* ── 申請人署名欄（空白 — 手書き用） ── */}
          <table className="sign-table" style={{ marginTop: "14px" }}>
            <tbody>
              <tr>
                <td colSpan={4} style={{
                  fontWeight: "bold", fontSize: "9px", textAlign: "center",
                  background: "#f0f0f0", letterSpacing: "0.03em", padding: "4px",
                }}>
                  以上の記載内容は事実と相違ありません。
                  <span className="bilingual-block">I hereby declare that the statement given above is true and correct.</span>
                </td>
              </tr>
              <tr>
                <td className="lbl" style={{ width: "32%", verticalAlign: "top", paddingTop: "4px", height: "50px" }}>
                  <div style={{ fontSize: "9px", fontWeight: "bold" }}>
                    申請人（法定代理人）の署名／申請書作成年月日
                  </div>
                  <div className="bilingual" style={{ marginTop: "2px" }}>
                    Signature of the applicant (arrow legal representative) / Date of filling in this form
                  </div>
                </td>
                <td style={{ width: "38%" }}>
                  {/* 署名スペース（空白） */}
                </td>
                <td className="lbl" style={{ width: "12%", textAlign: "center", fontSize: "9px" }}>
                  年月日<br /><span className="bilingual">Date</span>
                </td>
                <td className="sign-date" style={{ width: "18%", fontSize: "9px" }}>　　　年　　月　　日</td>
              </tr>
            </tbody>
          </table>
        </div>

      </body>
    </html>
  );
}

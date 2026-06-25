/**
 * 申請人等作成用 PDF（最大3ページ）
 * ─────────────────────────────────
 * Page 1: 申請人等作成用 １（全在留資格共通）
 * Page 2: 申請人等作成用 ２ V（「特定技能（１号）」・「特定技能（２号）」） ※特定技能のみ
 * Page 3: 申請人等作成用 ３ V（「特定技能（１号）」・「特定技能（２号）」） ※特定技能のみ
 *
 * Page 2・3 は在留資格カテゴリが V（特定技能）の場合のみ出力する。
 * それ以外の在留資格では Page 1 のみを出力し、末尾に署名欄を付す。
 *
 * 様式番号・申請書タイトルはヘッド部分（FormHeader）で全ページ共通のデザインに統一しつつ、
 * 申請書類の種別（formType）に応じて getFormNumber() / FORM_TITLE_MAP から動的に取得する。
 */
import { notFound } from "next/navigation";
import {
  loadShinseiData, PRINT_STYLES,
  fmt, fmtDate, fmtMoney, fmtAddr, fmtSex, fmtYesNo, yes, omitFor2Go,
  fmtAdditionalOccupations, buildAddress,
  FormHeader, SignatureSection, AgentSection,
  FORM_TITLE_MAP, FORM_DECLARATION_MAP, getFormNumber, getPdfHeaderCategoryLabel,
} from "../shinsei-shared";
import { ShinseiPrintToolbar } from "../shinsei-print-toolbar";
import { ShinseiMarginControls } from "../shinsei-margin-controls";

export default async function ShinseiApplicantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadShinseiData(id);
  if (!data) notFound();

  const { app, applicant, org, form, familyMembers, workHistory, today, isChange, formType, isCoe, cat, isVtype, isNtype, isTtype, isRtype, isPtype, is2Go } = data;

  // Part 2 の項目番号ベース（COE: 22〜, それ以外: 17〜）— shinsei.tsx と同一の算出方法
  const p2Base = isCoe ? 22 : 17;

  // ── ヘッド部分（様式番号・タイトル）: 申請書類の種別に応じて動的に切り替え ──
  const formNumber = getFormNumber(formType, cat);
  const formTitle = FORM_TITLE_MAP[formType];
  const formDeclaration = FORM_DECLARATION_MAP[formType];
  const categoryLabel = getPdfHeaderCategoryLabel(formType, app.visaType);

  return (
    <>
        <meta charSet="utf-8" />
        <title>申請人等作成用 - {form.familyNameEn} {form.givenNameEn}</title>
        <style>{PRINT_STYLES}</style>
        <ShinseiPrintToolbar applicationId={id} label="申請人等作成用（3ページ）" disableAutoPrint />
        <ShinseiMarginControls initialTopMm={7} initialBottomMm={7} sideMm={9} />

        {/* ══════════════════════════════════════════════════════════════════════
            Page 1: 別記第三十号様式（第二十条関係）申請人等作成用 １
            ════════════════════════════════════════════════════════════════════ */}
        <div className="page" style={{ paddingTop: "50px" }}>
          {/* ── ヘッダー（共通コンポーネント） ── */}
          <FormHeader
            showGov
            formNumber={formNumber}
            title={formTitle.ja}
            titleEn={formTitle.en}
            categoryLabel={categoryLabel}
          />

          <p style={{ fontSize: "8px", color: "#333", textAlign: "center", marginBottom: "6px" }}>
            {formDeclaration.ja}
            <br />
            <span className="bilingual">
              {formDeclaration.en}
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
                <td style={{ width: "25%" }}>{fmtDate(form.dateOfBirth)}</td>
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
                    <td>{m.relationship}</td><td>{m.name}</td><td>{fmtDate(m.dateOfBirth)}</td>
                    <td>{m.nationality}</td><td>{m.placeOfEmployment}</td>
                    <td style={{ textAlign: "center" }}>{m.residingTogether ? "○" : "×"}</td>
                    <td>{m.residenceCardNumber}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ── 【申請人署名欄】（Part2を持たない区分のみPage1で完結するためここに配置） ── */}
          {!isVtype && !isNtype && !isTtype && !isRtype && !isPtype && <SignatureSection role="applicant" />}
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            Page 2: N型専用ページ（技術・人文知識・国際業務 等）
            ════════════════════════════════════════════════════════════════════ */}
        {isNtype && (
        <div className="page">
          <FormHeader
            categoryLabel={categoryLabel}
          />

          <div className="section3">{p2Base}. 勤務先</div>
          <table>
            <tbody>
              <tr>
                <td className="lbl">名称</td><td>{fmt(form.employerName)}</td>
                <td className="lbl">支店・事業所名</td><td>{fmt(form.employerBranchName)}</td>
              </tr>
              <tr>
                <td className="lbl lbl-wrap">所在地（主たる勤務場所）</td><td>{fmtAddr(form.employerAddress)}</td>
                <td className="lbl">電話番号</td><td>{fmt(form.employerPhone)}</td>
              </tr>
            </tbody>
          </table>

          <div className="section3">{p2Base + 1}. 最終学歴</div>
          <table>
            <tbody>
              <tr>
                <td className="lbl">学校所在国</td><td>{fmt(form.educationCountry)}</td>
                <td className="lbl">学位・区分</td><td>{fmt(form.educationDegree)}</td>
              </tr>
              <tr>
                <td className="lbl">学校名</td><td>{fmt(form.educationSchoolName)}</td>
                <td className="lbl">卒業年月日</td><td>{fmtDate(form.educationGraduationDate)}</td>
              </tr>
            </tbody>
          </table>

          <div className="section3">{p2Base + 2}. 専攻・専門分野　　{p2Base + 3}. 情報処理技術者資格</div>
          <table>
            <tbody>
              <tr>
                <td className="lbl">専攻・専門分野</td>
                <td>{form.majorCategory === "その他" ? `その他：${fmt(form.majorCategoryOther)}` : fmt(form.majorCategory)}</td>
                <td className="lbl">情報処理技術者資格</td>
                <td>{form.itQualificationExists === "有（Yes）" ? `有 — ${fmt(form.itQualificationName)}` : "無（None）"}</td>
              </tr>
            </tbody>
          </table>

          <div className="section3">{p2Base + 4}. 職歴（直近4件）</div>
          {workHistory.length === 0 ? (
            <table><tbody><tr><td style={{ textAlign: "center", color: "#777" }}>なし</td></tr></tbody></table>
          ) : (
            <table>
              <thead>
                <tr><th style={{ width: "20%" }}>入社年月</th><th style={{ width: "20%" }}>退社年月</th><th>勤務先名称</th></tr>
              </thead>
              <tbody>
                {workHistory.map((w, i) => (
                  <tr key={i}><td>{fmt(w.joinDate)}</td><td>{fmt(w.leaveDate)}</td><td>{fmt(w.employer)}</td></tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ── 取次者 ── */}
          <AgentSection />

          <SignatureSection role="applicant" />
        </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            Page 2: T型専用ページ（日本人の配偶者等 等）
            ════════════════════════════════════════════════════════════════════ */}
        {isTtype && (
        <div className="page">
          <FormHeader
            categoryLabel={categoryLabel}
          />

          <div className="section3">配偶者・日本人等の情報</div>
          <table>
            <tbody>
              <tr>
                <td className="lbl">氏名（ローマ字）</td>
                <td colSpan={3}>{fmt(form.spouseFamilyNameEn)}　{fmt(form.spouseGivenNameEn)}</td>
              </tr>
              <tr>
                <td className="lbl">生年月日</td><td>{fmtDate(form.spouseDob)}</td>
                <td className="lbl">国籍・身分</td><td>{fmt(form.spouseResidenceStatus)}</td>
              </tr>
              <tr>
                <td className="lbl">在留カード番号等</td><td>{fmt(form.spouseResidenceCard)}</td>
                <td className="lbl">職業</td><td>{fmt(form.spouseOccupation)}</td>
              </tr>
              <tr>
                <td className="lbl">勤務先・通学先</td><td>{fmt(form.spouseEmployer)}</td>
                <td className="lbl"></td><td></td>
              </tr>
              <tr>
                <td className="lbl">住所</td><td colSpan={3}>{fmtAddr(form.spouseAddress)}</td>
              </tr>
            </tbody>
          </table>

          <div className="section3">婚姻・家族関係</div>
          <table>
            <tbody>
              <tr>
                <td className="lbl">婚姻（届出）年月日</td><td>{fmtDate(form.marriageDate)}</td>
                <td className="lbl">婚姻届出市区町村</td><td>{fmt(form.marriageRegistrationPlace)}</td>
              </tr>
              <tr>
                <td className="lbl">同居の有無</td>
                <td colSpan={3}>
                  {!yes(form.cohabitation)
                    ? `無 — ${fmt(form.separationReason)}`
                    : "有（同居）"}
                </td>
              </tr>
              {form.longTermResidentReason && (
                <tr>
                  <td className="lbl">定住者の根拠</td>
                  <td colSpan={3}>{fmt(form.longTermResidentReason)}</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* ── 取次者 ── */}
          <AgentSection />

          <SignatureSection role="applicant" />
        </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            Page 2: P型専用ページ（留学）
            ════════════════════════════════════════════════════════════════════ */}
        {isPtype && (
        <div className="page">
          <FormHeader
            categoryLabel={categoryLabel}
          />

          <div className="section3">在籍学校の情報</div>
          <table>
            <tbody>
              <tr>
                <td className="lbl">学校名</td><td colSpan={3}>{fmt(form.schoolName)}</td>
              </tr>
              <tr>
                <td className="lbl">学校の種別</td><td>{fmt(form.schoolType)}</td>
                <td className="lbl">電話番号</td><td>{fmt(form.schoolPhone)}</td>
              </tr>
              <tr>
                <td className="lbl">所在地</td><td colSpan={3}>{fmtAddr(form.schoolAddress)}</td>
              </tr>
              <tr>
                <td className="lbl">在籍コース・専攻</td><td>{fmt(form.courseOfStudy)}</td>
                <td className="lbl">年間学費</td><td>{fmtMoney(form.annualTuition)}</td>
              </tr>
              <tr>
                <td className="lbl">入学（予定）年月日</td><td>{fmtDate(form.enrollmentDate)}</td>
                <td className="lbl">卒業予定年月日</td><td>{fmtDate(form.expectedGraduationDate)}</td>
              </tr>
            </tbody>
          </table>

          <div className="section3">費用支弁方法</div>
          <table>
            <tbody>
              <tr>
                <td className="lbl">費用支弁方法</td><td>{fmt(form.fundingSource)}</td>
                <td className="lbl">月額生活費</td><td>{fmtMoney(form.fundingAmount)}</td>
              </tr>
              <tr>
                <td className="lbl">奨学金名称</td><td>{fmt(form.scholarshipName)}</td>
                <td className="lbl">奨学金月額</td><td>{fmtMoney(form.scholarshipAmount)}</td>
              </tr>
              <tr>
                <td className="lbl">資格外活動許可</td>
                <td colSpan={3}>{fmt(form.partTimeWorkPermit)}</td>
              </tr>
            </tbody>
          </table>

          {/* ── 取次者 ── */}
          <AgentSection />

          <SignatureSection role="applicant" />
        </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            Page 2: R型専用ページ（家族滞在）
            ════════════════════════════════════════════════════════════════════ */}
        {isRtype && (
        <div className="page">
          <FormHeader
            categoryLabel={categoryLabel}
          />

          <div className="section">
            申請人等作成用　２　Ｒ　—「家族滞在」{isChange ? '在留資格変更用' : '在留期間更新用'}　（項目 17〜20）
          </div>

          <div className="section3">17. 婚姻・出生又は縁組の届出先及び届出年月日</div>
          <table>
            <tbody>
              <tr>
                <td className="lbl" style={{width:'25%'}}>(1) 日本国届出先</td>
                <td style={{width:'25%'}}>{fmt(form.marriageNotificationPlaceJapan)}</td>
                <td className="lbl" style={{width:'25%'}}>　届出年月日</td>
                <td style={{width:'25%'}}>{fmtDate(form.marriageNotificationDateJapan)}</td>
              </tr>
              <tr>
                <td className="lbl">(2) 本国等届出先</td>
                <td>{fmt(form.marriageNotificationPlaceForeign)}</td>
                <td className="lbl">　届出年月日</td>
                <td>{fmtDate(form.marriageNotificationDateForeign)}</td>
              </tr>
            </tbody>
          </table>

          <div className="section3">18. 滞在費支弁方法</div>
          <table>
            <tbody>
              <tr>
                <td style={{padding:'5px 8px'}}>
                  {['親族負担','外国からの送金','身元保証人負担'].map(opt => (
                    <span key={opt} style={{marginRight:'20px'}}>
                      {form.fundingMethod === opt ? '■' : '□'} {opt}
                    </span>
                  ))}
                  <span>
                    {form.fundingMethod === 'その他' ? '■' : '□'} その他
                    {form.fundingMethod === 'その他' && form.fundingMethodOther ? `（${form.fundingMethodOther}）` : '（　　　　　）'}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>

          <div className="section3">19. 資格外活動の有無</div>
          <table>
            <tbody>
              <tr>
                <td className="lbl" style={{width:'30%'}}>資格外活動</td>
                <td colSpan={3}>
                  {yes(form.partTimeWorkExistsR)
                    ? '有'
                    : '無'}
                </td>
              </tr>
              {yes(form.partTimeWorkExistsR) && (
                <>
                  <tr>
                    <td className="lbl">(1) 内容</td>
                    <td colSpan={3}>{fmt(form.partTimeWorkTypeR)}</td>
                  </tr>
                  <tr>
                    <td className="lbl">(2) 名称</td>
                    <td>{fmt(form.partTimeWorkOrgNameR)}</td>
                    <td className="lbl">支店・事業所名</td>
                    <td>{fmt(form.partTimeWorkBranchNameR)}</td>
                  </tr>
                  <tr>
                    <td className="lbl">　 電話番号</td>
                    <td colSpan={3}>{fmt(form.partTimeWorkPhoneR)}</td>
                  </tr>
                  <tr>
                    <td className="lbl">(3) 週間稼働時間</td>
                    <td>{form.partTimeWorkHoursR ? `${form.partTimeWorkHoursR} 時間` : '　'}</td>
                    <td className="lbl">(4) 報酬</td>
                    <td>
                      {form.partTimeWorkSalaryR
                        ? `${Number(form.partTimeWorkSalaryR).toLocaleString()}円（${form.partTimeWorkSalaryTypeR ?? '月額'}）`
                        : '　'}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>

          <div className="section3">20. 代理人（法定代理人による申請の場合に記入）</div>
          <table className="sign-table">
            <tbody>
              <tr>
                <td className="lbl" style={{width:'25%'}}>(1) 氏名</td>
                <td style={{width:'25%'}}>{fmt(form.representativeName)}</td>
                <td className="lbl" style={{width:'25%'}}>(2) 本人との関係</td>
                <td style={{width:'25%'}}>{fmt(form.representativeRelationship)}</td>
              </tr>
              <tr>
                <td className="lbl">(3) 住所</td>
                <td colSpan={3}>{fmtAddr(form.representativeAddress)}</td>
              </tr>
              <tr>
                <td className="lbl">電話番号</td>
                <td>{fmt(form.representativePhone)}</td>
                <td className="lbl">携帯電話番号</td>
                <td>{fmt(form.representativeCellular)}</td>
              </tr>
            </tbody>
          </table>


          {/* 取次者（固定） */}
          <AgentSection variant="compact" />

          <SignatureSection role="applicant" />
        </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            Page 2〜3: 特定技能（V型）専用ページ
            ════════════════════════════════════════════════════════════════════ */}
        {isVtype && (
        <>
        {/* Page 2: 申請人等作成用 ２ V（「特定技能（１号）」・「特定技能（２号）」） */}
        <div className="page">
          {/* 2ページ目以降は様式タイトルの重複表示を避け、Part表記のみ表示する */}
          <FormHeader
            categoryLabel={categoryLabel}
          />

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
                {omitFor2Go(
                  is2Go,
                  `${form.cumulativeStayYears ? `${form.cumulativeStayYears}年` : ''}${form.cumulativeStayMonths ? `${form.cumulativeStayMonths}ヶ月` : ''}`
                )}
              </td>
            </tr>
          </tbody></table>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            Page 3: 申請人等作成用 ３ V（「特定技能（１号）」・「特定技能（２号）」）
            ════════════════════════════════════════════════════════════════════ */}
        <div className="page">
          {/* 2ページ目以降は様式タイトルの重複表示を避け、Part表記のみ表示する */}
          <FormHeader
            categoryLabel={categoryLabel}
          />

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
          <AgentSection />

          {/* ── 【申請人署名欄】（共通コンポーネント・手書き署名用） ── */}
          <SignatureSection role="applicant" />
        </div>
        </>
        )}

    </>
  );
}

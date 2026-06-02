import { auth } from "@/lib/auth";
import { db, applications, applicantMaster, organizationMaster } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { ApplicationFormData, FamilyMember, WorkHistoryEntry } from "@/lib/form-types";
import { FORM_TYPE_LABELS, VISA_CATEGORY_NEEDS_ORG, VISA_CATEGORY_PART2 } from "@/lib/form-types";
import { PrintTrigger } from "../print-trigger";

function fmt(v: string | null | undefined) { return v || "　"; }
function fmtDate(v: string | null | undefined) {
  if (!v) return "　";
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}
function fmtMoney(v: string | null | undefined) {
  if (!v) return "　";
  const n = Number(String(v).replace(/,/g, ""));
  return isNaN(n) ? String(v) : `${n.toLocaleString()}円`;
}
function businessTypeLabel(code: string) { return code ? `${code}番` : "　"; }

// ─── 後方互換ヘルパー（旧英語混在値 "有（Yes）" と新日本語値 "有" の両方に対応） ─
function yes(v: string | null | undefined): boolean {
  if (!v) return false;
  return v === "有" || v.startsWith("有（") || v === "あり" || v.startsWith("あり（");
}
function no(v: string | null | undefined): boolean { return !yes(v); }
function fmtYesNo(v: string | null | undefined): string { return yes(v) ? "有" : "無"; }
function fmtSex(v: string | null | undefined): string {
  if (!v) return "　";
  if (v.startsWith("男")) return "男";
  if (v.startsWith("女")) return "女";
  return v;
}
function fmtWorkPeriod(v: string | null | undefined): string {
  if (!v) return "定めなし";
  if (v === "定めなし" || v.startsWith("定めなし")) return "定めなし";
  if (v === "定めあり" || v.startsWith("定めあり")) return "定めあり";
  return v;
}
function fmtContractType(v: string | null | undefined): string {
  if (!v) return "　";
  // "雇用（Employment）" → "雇用" など
  return v.replace(/（[^）]*）$/, "");
}

export default async function ShinseiPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const tenantId = (session?.user as any)?.tenantId;
  if (!tenantId) notFound();

  const [app] = await db.select().from(applications)
    .where(and(eq(applications.id, id), eq(applications.tenantId, tenantId))).limit(1);
  if (!app) notFound();

  const [applicant] = await db.select().from(applicantMaster)
    .where(eq(applicantMaster.id, app.applicantId)).limit(1);
  const org = app.organizationId
    ? await db.select().from(organizationMaster)
        .where(eq(organizationMaster.id, app.organizationId)).limit(1).then(r => r[0])
    : null;

  const form = (app.formData ?? {}) as Partial<ApplicationFormData>;

  // 申請書種別判定
  const toFormType = (t: string) => {
    if (t === "coe" || t === "certification") return "coe" as const;
    if (t === "change") return "change" as const;
    if (t === "extension" || t === "renewal") return "extension" as const;
    if (t === "permanent" || t === "permanent_residence") return "permanent" as const;
    return "extension" as const;
  };
  const formType = toFormType(form.applicationFormType ?? app.applicationType);
  const isCoe = formType === "coe";
  const isChange = formType === "change";
  const isExtension = formType === "extension";

  // 在留資格カテゴリ
  const cat = form.visaFormCategory ?? 'N';
  const isNtype = ['N', 'L', 'I'].includes(cat);
  const isTtype = cat === 'T';
  const isRtype = cat === 'R';
  const isPtype = cat === 'P';
  const isVtype = cat === 'V';   // 特定技能（１号・２号）
  const needsOrg = VISA_CATEGORY_NEEDS_ORG[cat as keyof typeof VISA_CATEGORY_NEEDS_ORG] ?? false;

  const formTitle = FORM_TYPE_LABELS[formType] ?? `在留申請書（${formType}）`;
  const today = `${new Date().getFullYear()}年${new Date().getMonth() + 1}月${new Date().getDate()}日`;
  const familyMembers = (form.familyInJapan ?? []) as FamilyMember[];
  const workHistory = (form.workHistory ?? []) as WorkHistoryEntry[];

  // COE/Change/Extension の項目番号差異
  // COE: 出生地=5, 配偶者=6, 職業=7, 住所=9, 旅券=10
  // Change: 出生地=5, 配偶者=6, 職業=7, 住所=9, 旅券=10 (同じ)
  // Extension: 配偶者=5, 職業=6, 住所=8, 旅券=9/10 (出生地なし)
  const hasBirthplace = isCoe || isChange;
  const criminalItemNo  = isCoe ? 19 : 15;
  const familyItemNo    = isCoe ? 21 : 16;
  const orgDispatchNo   = isCoe ? 12 : 11;

  // Part 2 の項目番号ベース
  const p2Base = isCoe ? 22 : 17;

  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <title>申請書 - {form.familyNameEn} {form.givenNameEn}</title>
        <style>{`
          *{box-sizing:border-box;margin:0;padding:0;}
          body{
            font-family:"MS Mincho","ＭＳ 明朝","Hiragino Mincho ProN","游明朝",serif;
            font-size:11px;color:#000;background:#f3f4f6;line-height:1.5;
          }
          .page{background:#fff;max-width:210mm;margin:0 auto;padding:14mm 16mm;min-height:297mm;}
          @media screen{.page{margin:20px auto;box-shadow:0 4px 24px rgba(0,0,0,.12);border-radius:4px;}}
          @media print{
            body{background:#fff;}
            *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important;}
            .page{padding:10mm 13mm;max-width:100%;min-height:auto;}
            .no-print{display:none!important;}
          }

          .form-title{text-align:center;font-size:15px;font-weight:bold;border:2px solid #000;padding:7px 14px;margin-bottom:10px;letter-spacing:0.05em;}
          .form-subtitle{font-size:9px;text-align:right;margin-bottom:10px;color:#444;}

          table{width:100%;border-collapse:collapse;margin-bottom:8px;}
          td,th{border:1px solid #333;padding:4px 8px;vertical-align:middle;font-size:10.5px;line-height:1.45;}
          .lbl{background:#d5d5d5;font-weight:bold;white-space:nowrap;width:25%;}
          .lbl-w20{width:20%;}

          .section{background:#1c1c1c;color:#fff;font-weight:bold;font-size:11.5px;padding:5px 9px;margin:14px 0 5px;letter-spacing:0.03em;}
          .section2{background:#444;color:#fff;font-size:10.5px;padding:3px 8px;margin:8px 0 4px;}
          .section3{background:#777;color:#fff;font-size:10px;padding:3px 7px;margin:5px 0 3px;}

          .sign-table td{height:44px;}
          .page-break{page-break-before:always;}

          /* 署名日・年月日の表示/非表示切替 */
          .sign-date{transition:visibility 0s;white-space:nowrap;}
          body.hide-sign-date .sign-date{visibility:hidden;}
          @media print{body.hide-sign-date .sign-date{visibility:hidden!important;}}
          th{background:#c8c8c8;font-weight:bold;}
        `}</style>
      </head>
      <body>
        <PrintTrigger applicationId={id} />
        <div className="page" style={{ paddingTop: "56px" }}>

          {/* ══ タイトル ══════════════════════════════════════════════════════ */}
          <div className="form-title">{formTitle}</div>
          <div className="form-subtitle">作成日：{today}　|　案件番号：{app.caseNumber}</div>

          {/* ══ 申請人等作成用 Part 1 共通（項目1〜旅券） ══════════════════════ */}
          <div className="section">申請人等作成用　Part 1　— 基本情報</div>
          <table>
            <tbody>
              <tr>
                <td className="lbl">1. 国籍・地域</td><td>{fmt(form.nationality)}</td>
                <td className="lbl">2. 生年月日</td><td>{fmtDate(form.dateOfBirth)}</td>
              </tr>
              <tr>
                <td className="lbl">3. 氏名（ローマ字）</td>
                <td colSpan={3}>{fmt(form.familyNameEn)}　{fmt(form.givenNameEn)}</td>
              </tr>
              <tr>
                <td className="lbl">　 氏名（漢字・カナ）</td>
                <td colSpan={3}>{(form.familyNameJa || form.givenNameJa) ? `${fmt(form.familyNameJa)}　${fmt(form.givenNameJa)}` : "　"}</td>
              </tr>
              <tr>
                <td className="lbl">4. 性別</td><td>{fmtSex(form.sex)}</td>
                {hasBirthplace
                  ? <><td className="lbl">5. 出生地</td><td>{fmt(form.placeOfBirth)}</td></>
                  : <><td className="lbl">5. 配偶者の有無</td><td>{fmt(form.maritalStatus)}</td></>
                }
              </tr>
              {hasBirthplace && (
                <tr>
                  <td className="lbl">6. 配偶者の有無</td><td>{fmt(form.maritalStatus)}</td>
                  <td className="lbl">7. 職業</td><td>{fmt(form.occupation)}</td>
                </tr>
              )}
              {!hasBirthplace && (
                <tr>
                  <td className="lbl">6. 職業</td><td>{fmt(form.occupation)}</td>
                  <td className="lbl"></td><td></td>
                </tr>
              )}
              <tr>
                <td className="lbl">{hasBirthplace ? '8.' : '7.'} 本国における居住地</td>
                <td colSpan={3}>{fmt(form.homeTownCity)}</td>
              </tr>
              <tr>
                <td className="lbl">{hasBirthplace ? '9.' : '8.'} 住居地（日本）</td>
                <td colSpan={3}>
                  {(() => {
                    const zip = form.postalCodeInJapan;
                    const pref = form.prefectureInJapan;
                    const city = form.cityInJapan;
                    const line = form.addressLineInJapan;
                    // 分割フィールドが使われている場合
                    if (pref || city || line) {
                      return `${zip ? "〒" + zip + "　" : ""}${pref ?? ""}${city ?? ""}${line ?? ""}`;
                    }
                    // 旧来の結合フィールド
                    return `${zip ? "〒" + zip + "　" : ""}${fmt(form.addressInJapan)}`;
                  })()}
                </td>
              </tr>
              <tr>
                <td className="lbl">　 電話番号</td><td>{fmt(form.telephoneNo)}</td>
                <td className="lbl">　 携帯電話番号</td><td>{fmt(form.cellularPhoneNo)}</td>
              </tr>
              <tr>
                <td className="lbl">{hasBirthplace ? '10.' : '9/10.'} 旅券番号</td><td>{fmt(form.passportNumber)}</td>
                <td className="lbl">有効期限</td><td>{fmtDate(form.passportExpiry)}</td>
              </tr>
            </tbody>
          </table>

          {/* ── COE 固有（項目11〜20） ──────────────────────────────────────── */}
          {isCoe && (
            <>
              <div className="section2">在留資格認定証明書交付申請 — 入国目的・申請歴（項目 11〜20）</div>
              <table>
                <tbody>
                  <tr>
                    <td className="lbl">11. 入国目的（在留資格）</td><td colSpan={3}>{fmt(form.purposeOfEntry)}</td>
                  </tr>
                  <tr>
                    <td className="lbl">12. 入国予定年月日</td><td>{fmtDate(form.scheduledDateOfEntry)}</td>
                    <td className="lbl">13. 上陸予定港</td><td>{fmt(form.portOfEntry)}</td>
                  </tr>
                  <tr>
                    <td className="lbl">14. 滞在予定期間</td><td>{fmt(form.intendedLengthOfStay)}</td>
                    <td className="lbl">15. 同伴者の有無</td><td>{fmt(form.accompanyingPersons)}</td>
                  </tr>
                  <tr>
                    <td className="lbl">16. 査証申請予定地</td><td colSpan={3}>{fmt(form.intendedPlaceForVisa)}</td>
                  </tr>
                  <tr>
                    <td className="lbl">17. 過去の出入国歴</td>
                    <td colSpan={3}>
                      {yes(form.pastEntryHistory)
                        ? `有 — 回数：${fmt(form.pastEntryCount)}回　最新：${fmtDate(form.pastEntryLatestFrom)} 〜 ${fmtDate(form.pastEntryLatestTo)}`
                        : "無"}
                    </td>
                  </tr>
                  <tr>
                    <td className="lbl">18. 過去の認定証明書申請歴</td>
                    <td colSpan={3}>
                      {yes(form.pastCoeHistory)
                        ? `有 — 申請回数：${fmt(form.pastCoeCount)}回　うち不交付：${fmt(form.pastCoeNonIssuanceCount)}回`
                        : "無"}
                    </td>
                  </tr>
                  <tr>
                    <td className="lbl">19. 犯罪記録の有無</td>
                    <td colSpan={3}>{yes(form.criminalRecord) ? `有 — ${fmt(form.criminalRecordDetail)}` : "無"}</td>
                  </tr>
                  <tr>
                    <td className="lbl">20. 退去強制歴の有無</td>
                    <td colSpan={3}>
                      {yes(form.deportationHistory)
                        ? `有 — 回数：${fmt(form.deportationCount)}回　最新：${fmtDate(form.deportationLatestDate)}`
                        : "無"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </>
          )}

          {/* ── Change 固有（項目11〜15） ──────────────────────────────────── */}
          {isChange && (
            <>
              <div className="section2">在留資格変更許可申請 — 現在の在留状況・変更内容（項目 11〜15）</div>
              <table>
                <tbody>
                  <tr>
                    <td className="lbl">11. 現在の在留資格</td><td>{fmt(form.currentStatusOfResidence)}</td>
                    <td className="lbl">　  在留期間</td><td>{fmt(form.currentPeriodOfStay)}</td>
                  </tr>
                  <tr>
                    <td className="lbl">　  在留期間満了日</td><td>{fmtDate(form.currentPeriodExpiry)}</td>
                    <td className="lbl">12. 在留カード番号</td><td>{fmt(form.residenceCardNumber)}</td>
                  </tr>
                  <tr>
                    <td className="lbl">13. 希望する在留資格</td><td>{fmt(form.desiredStatusOfResidence)}</td>
                    <td className="lbl">　  希望する在留期間</td><td>{fmt(form.desiredPeriodOfStay)}</td>
                  </tr>
                  <tr>
                    <td className="lbl">14. 変更の理由</td>
                    <td colSpan={3} style={{ whiteSpace: "pre-wrap", minHeight: "48px" }}>{fmt(form.reasonForApplication)}</td>
                  </tr>
                  <tr>
                    <td className="lbl">15. 犯罪記録の有無</td>
                    <td colSpan={3}>{yes(form.criminalRecord) ? `有 — ${fmt(form.criminalRecordDetail)}` : "無"}</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}

          {/* ── Extension 固有（項目11〜15） ─────────────────────────────── */}
          {isExtension && (
            <>
              <div className="section2">在留期間更新許可申請 — 現在の在留状況・更新内容（項目 11〜15）</div>
              <table>
                <tbody>
                  <tr>
                    <td className="lbl">11. 現在の在留資格</td><td>{fmt(form.currentStatusOfResidence)}</td>
                    <td className="lbl">　  在留期間</td><td>{fmt(form.currentPeriodOfStay)}</td>
                  </tr>
                  <tr>
                    <td className="lbl">　  在留期間満了日</td><td>{fmtDate(form.currentPeriodExpiry)}</td>
                    <td className="lbl">12. 在留カード番号</td><td>{fmt(form.residenceCardNumber)}</td>
                  </tr>
                  <tr>
                    <td className="lbl">13. 希望する在留期間</td>
                    <td colSpan={3}>{fmt(form.desiredPeriodOfStay)}</td>
                  </tr>
                  <tr>
                    <td className="lbl">14. 更新の理由</td>
                    <td colSpan={3} style={{ whiteSpace: "pre-wrap", minHeight: "48px" }}>{fmt(form.reasonForApplication)}</td>
                  </tr>
                  <tr>
                    <td className="lbl">15. 犯罪記録の有無</td>
                    <td colSpan={3}>{yes(form.criminalRecord) ? `有 — ${fmt(form.criminalRecordDetail)}` : "無"}</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}

          {/* ── 共通：在日親族及び同居者 ────────────────────────────────────── */}
          <div className="section2">{familyItemNo}. 在日親族及び同居者</div>
          {familyMembers.length === 0 ? (
            <table><tbody><tr><td style={{ textAlign: "center", color: "#777", padding: "6px" }}>なし（None）</td></tr></tbody></table>
          ) : (
            <table>
              <thead>
                <tr>
                  <th style={{ width: "10%" }}>続柄</th><th style={{ width: "18%" }}>氏名</th>
                  <th style={{ width: "12%" }}>生年月日</th><th style={{ width: "10%" }}>国籍</th>
                  <th style={{ width: "22%" }}>勤務先・通学先</th><th style={{ width: "8%" }}>同居</th>
                  <th style={{ width: "20%" }}>在留カード番号</th>
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

          {/* ══ 申請人等作成用 Part 2 ══════════════════════════════════════════ */}

          {/* ── N型 Part 2（就労系） ─────────────────────────────────────────── */}
          {isNtype && (
            <>
              <div className="section page-break">
                申請人等作成用　Part 2 N　— 就労・学歴（項目 {p2Base}〜{p2Base + 5}）
              </div>

              <div className="section3">{p2Base}. 勤務先</div>
              <table>
                <tbody>
                  <tr>
                    <td className="lbl">名称</td><td>{fmt(form.employerName)}</td>
                    <td className="lbl">支店・事業所名</td><td>{fmt(form.employerBranchName)}</td>
                  </tr>
                  <tr>
                    <td className="lbl">所在地（主たる勤務場所）</td><td colSpan={3}>{fmt(form.employerAddress)}</td>
                  </tr>
                  <tr>
                    <td className="lbl">電話番号</td><td>{fmt(form.employerPhone)}</td>
                    <td className="lbl"></td><td></td>
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
            </>
          )}

          {/* ── T型 Part 2（日本人配偶者等） ─────────────────────────────────── */}
          {isTtype && (
            <>
              <div className="section page-break">申請人等作成用　Part 2 T　— 配偶者等の情報</div>

              <div className="section3">配偶者・日本人等の情報</div>
              <table>
                <tbody>
                  <tr>
                    <td className="lbl">氏名（ローマ字）</td>
                    <td>{fmt(form.spouseFamilyNameEn)}　{fmt(form.spouseGivenNameEn)}</td>
                    <td className="lbl">氏名（漢字）</td>
                    <td>{fmt(form.spouseFamilyNameJa)}　{fmt(form.spouseGivenNameJa)}</td>
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
                    <td className="lbl">住所</td><td colSpan={3}>{fmt(form.spouseAddress)}</td>
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
                      {no(form.cohabitation)
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
            </>
          )}

          {/* ── R型 Part 2（申請人用２Ｒ：項目17〜20 + 取次者） ──────────────── */}
          {isRtype && (
            <>
              <div className="section page-break">
                申請人等作成用　２　Ｒ　—「家族滞在」在留期間更新用　（項目 17〜20）
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
                    <td colSpan={3}>{fmt(form.representativeAddress)}</td>
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
              <div className="section3" style={{marginTop:'10px'}}>※ 取次者</div>
              <table>
                <tbody>
                  <tr>
                    <td className="lbl" style={{width:'20%'}}>(1) 氏名</td>
                    <td colSpan={3}>山口忠士</td>
                  </tr>
                  <tr>
                    <td className="lbl">(3) 所属機関等</td>
                    <td colSpan={3}>兵庫県行政書士会</td>
                  </tr>
                  <tr>
                    <td className="lbl">(2) 住所</td>
                    <td colSpan={3}>〒665-0864 兵庫県宝塚市泉町22-25 島上マンション南棟1-B</td>
                  </tr>
                  <tr>
                    <td className="lbl">電話番号</td>
                    <td colSpan={3}>090-2596-0128</td>
                  </tr>
                </tbody>
              </table>

              {/* ── 申請人署名欄（申請人等作成用の末尾・R型） ─────────────────────── */}
              <table className="sign-table" style={{ marginTop: "16px" }}>
                <tbody>
                  <tr>
                    <td colSpan={4} style={{ fontWeight: "bold", fontSize: "11px", textAlign: "center", background: "#f0f0f0", letterSpacing: "0.05em", height: "26px" }}>
                      以上の記載内容は事実と相違ありません。
                    </td>
                  </tr>
                  <tr>
                    <td className="lbl" style={{ width: "28%", verticalAlign: "top", paddingTop: "5px", height: "50px" }}>
                      <div style={{ fontSize: "10.5px", fontWeight: "bold" }}>申請人（法定代理人）の署名</div>
                      {(form.familyNameJa || form.givenNameJa || form.familyNameEn || form.givenNameEn) && (
                        <div style={{ fontSize: "9.5px", marginTop: "3px", fontWeight: "normal", color: "#333" }}>
                          氏名：{form.familyNameJa
                            ? `${fmt(form.familyNameJa)}　${fmt(form.givenNameJa)}`
                            : `${fmt(form.familyNameEn)} ${fmt(form.givenNameEn)}`}
                        </div>
                      )}
                    </td>
                    <td style={{ width: "36%" }}></td>
                    <td className="lbl" style={{ width: "16%", textAlign: "center" }}>署名日</td>
                    <td className="sign-date" style={{ width: "20%" }}>　　年　　月　　日</td>
                  </tr>
                </tbody>
              </table>

              {/* ── 扶養者用Ｒ（別ページ） ─────────────────────────────────────── */}
              <div className="section page-break">
                扶養者等作成用　１　Ｒ　—「家族滞在」在留期間更新用
              </div>

              <div className="section3">1. 扶養している家族（申請人）の氏名及び在留カード番号</div>
              <table>
                <tbody>
                  <tr>
                    <td className="lbl" style={{width:'30%'}}>(1) 氏名</td>
                    <td colSpan={3}>
                      {form.familyNameEn ? `${fmt(form.familyNameEn)} ${fmt(form.givenNameEn)}` : '　'}
                      {(form.familyNameJa || form.givenNameJa) ? `　${fmt(form.familyNameJa)}　${fmt(form.givenNameJa)}` : ''}
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
                      {fmt(form.supporterFamilyNameEn)}　{fmt(form.supporterGivenNameEn)}
                      {(form.supporterFamilyNameJa || form.supporterGivenNameJa)
                        ? `　（${fmt(form.supporterFamilyNameJa)}　${fmt(form.supporterGivenNameJa)}）`
                        : ''}
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
                    <td colSpan={3}>{fmt(form.supporterAddress)}</td>
                  </tr>
                  <tr>
                    <td className="lbl">(13) 年収</td>
                    <td colSpan={3}>{form.supporterAnnualIncome ? `${Number(form.supporterAnnualIncome).toLocaleString()} 円` : '　'}</td>
                  </tr>
                </tbody>
              </table>

              {/* 扶養者署名欄 */}
              <table className="sign-table" style={{ marginTop: "12px" }}>
                <tbody>
                  <tr>
                    <td colSpan={4} style={{ fontWeight: "bold", fontSize: "11px", textAlign: "center", background: "#f0f0f0", letterSpacing: "0.05em", height: "26px" }}>
                      以上の記載内容は事実と相違ありません。
                    </td>
                  </tr>
                  <tr>
                    <td className="lbl" style={{ width: "28%", verticalAlign: "top", paddingTop: "5px", height: "50px" }}>
                      <div style={{ fontSize: "10.5px", fontWeight: "bold" }}>扶養者の署名</div>
                      {(form.supporterFamilyNameJa || form.supporterGivenNameJa || form.supporterFamilyNameEn || form.supporterGivenNameEn) && (
                        <div style={{ fontSize: "9.5px", marginTop: "3px", fontWeight: "normal", color: "#333" }}>
                          氏名：{form.supporterFamilyNameJa
                            ? `${fmt(form.supporterFamilyNameJa)}　${fmt(form.supporterGivenNameJa)}`
                            : `${fmt(form.supporterFamilyNameEn)} ${fmt(form.supporterGivenNameEn)}`}
                        </div>
                      )}
                    </td>
                    <td style={{ width: "36%" }}></td>
                    <td className="lbl" style={{ width: "16%", textAlign: "center" }}>署名日</td>
                    <td className="sign-date" style={{ width: "20%" }}>　　年　　月　　日</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}

          {/* ── P型 Part 2（留学：学校情報） ──────────────────────────────── */}
          {isPtype && (
            <>
              <div className="section page-break">申請人等作成用　Part 2 P　— 在籍学校・費用支弁</div>
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
                    <td className="lbl">所在地</td><td colSpan={3}>{fmt(form.schoolAddress)}</td>
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
            </>
          )}

          {/* ── V型 Part 2（特定技能） ──────────────────────────────────── */}
          {isVtype && (
            <>
              <div className="section page-break">
                申請人等作成用　２　Ｖ　—「特定技能（１号・２号）」（項目 17〜21）
              </div>

              <div className="section3">17. 特定技能所属機関</div>
              <table><tbody>
                <tr><td className="lbl" style={{width:'30%'}}>(1) 名称</td><td colSpan={3}>{fmt(form.employerName)}</td></tr>
                <tr><td className="lbl">(2) 所在地</td><td colSpan={3}>{fmt(form.employerAddress)}</td><td className="lbl" style={{width:'15%'}}>電話番号</td><td>{fmt(form.employerPhone)}</td></tr>
              </tbody></table>

              <div className="section3">18. 技能水準</div>
              <table><tbody>
                <tr><td className="lbl" style={{width:'30%'}}>証明方法</td><td colSpan={3}>{fmt(form.skillLevelProofMethod)}</td></tr>
                {form.skillLevelExamName1 && <tr><td className="lbl">試験名①</td><td>{fmt(form.skillLevelExamName1)}</td><td className="lbl" style={{width:'15%'}}>試験地①</td><td>{fmt(form.skillLevelExamCountry1)}{form.skillLevelExamCountry1 === '国外' ? `（${form.skillLevelExamCountryName1}）` : ''}</td></tr>}
                {form.skillLevelExamName2 && <tr><td className="lbl">試験名②</td><td>{fmt(form.skillLevelExamName2)}</td><td className="lbl">試験地②</td><td>{fmt(form.skillLevelExamCountry2)}{form.skillLevelExamCountry2 === '国外' ? `（${form.skillLevelExamCountryName2}）` : ''}</td></tr>}
              </tbody></table>

              <div className="section3">19. 日本語能力（特定技能１号の場合）</div>
              <table><tbody>
                <tr><td className="lbl" style={{width:'30%'}}>証明方法</td><td colSpan={3}>{fmt(form.japaneseAbilityProofMethod)}</td></tr>
                {form.japaneseAbilityExamName1 && <tr><td className="lbl">試験名①</td><td>{fmt(form.japaneseAbilityExamName1)}</td><td className="lbl" style={{width:'15%'}}>試験地①</td><td>{fmt(form.japaneseAbilityExamCountry1)}{form.japaneseAbilityExamCountry1 === '国外' ? `（${form.japaneseAbilityExamCountryName1}）` : ''}</td></tr>}
                {form.japaneseAbilityExamName2 && <tr><td className="lbl">試験名②</td><td>{fmt(form.japaneseAbilityExamName2)}</td><td className="lbl">試験地②</td><td>{fmt(form.japaneseAbilityExamCountry2)}{form.japaneseAbilityExamCountry2 === '国外' ? `（${form.japaneseAbilityExamCountryName2}）` : ''}</td></tr>}
              </tbody></table>

              {(form.completedTit2Occupation1 || form.completedTit2Occupation2) && (<>
                <div className="section3">20. 修了した技能実習2号</div>
                <table><tbody>
                  <tr><td className="lbl" style={{width:'20%'}}>職種①</td><td>{fmt(form.completedTit2Occupation1)}</td><td className="lbl" style={{width:'15%'}}>作業①</td><td>{fmt(form.completedTit2Operations1)}</td><td className="lbl" style={{width:'15%'}}>証明</td><td>{fmt(form.completedTit2ProofType1)}</td></tr>
                  {form.completedTit2Occupation2 && <tr><td className="lbl">職種②</td><td>{fmt(form.completedTit2Occupation2)}</td><td className="lbl">作業②</td><td>{fmt(form.completedTit2Operations2)}</td><td className="lbl">証明</td><td>{fmt(form.completedTit2ProofType2)}</td></tr>}
                </tbody></table>
              </>)}

              {(form.cumulativeStayYears || form.cumulativeStayMonths) && (<>
                <div className="section3">21. 通算在留期間（特定技能１号）</div>
                <table><tbody>
                  <tr><td className="lbl" style={{width:'30%'}}>通算在留期間</td><td>{form.cumulativeStayYears ? `${form.cumulativeStayYears}年` : '　'}{form.cumulativeStayMonths ? `${form.cumulativeStayMonths}ヶ月` : '　'}</td></tr>
                </tbody></table>
              </>)}

              {/* Part 3 V — 項目22〜27 */}
              <div className="section page-break">
                申請人等作成用　３　Ｖ　—「特定技能（１号・２号）」（項目 22〜27）
              </div>
              <table><tbody>
                <tr><td className="lbl" style={{width:'60%'}}>22. 保証金徴収・財産管理・違約金契約の有無</td><td>{fmtYesNo(form.depositContractExists)}</td></tr>
                <tr><td className="lbl">23. 外国の機関への費用（了解の有無）</td><td>{fmtYesNo(form.overseasExpensesExists)}{form.overseasExpensesExists === '有' ? `（${fmt(form.overseasExpensesOrgName)}、約${fmt(form.overseasExpensesAmount)}円）` : ''}</td></tr>
                <tr><td className="lbl">24. 本国・居住国の手続きの実施</td><td>{fmtYesNo(form.homeCountryProcedureComplied)}</td></tr>
                <tr><td className="lbl">25. 定期的費用の了解</td><td>{fmtYesNo(form.regularExpensesUnderstood)}</td></tr>
                <tr><td className="lbl">26. 技能移転への努力（技能実習歴あり＋2号希望の場合）</td><td>{fmtYesNo(form.technologyTransferEffortV)}</td></tr>
                <tr><td className="lbl">27. 特定産業分野の基準への適合</td><td>{fmtYesNo(form.ssfSpecificFieldCriteriaMet)}</td></tr>
              </tbody></table>

              {/* 28. 職歴 */}
              {workHistory.length > 0 && workHistory.some(w => w.employer) && (<>
                <div className="section3">28. 職歴（外国における職歴を含む）</div>
                <table><tbody>
                  <tr>
                    <td className="lbl" style={{width:'15%'}}>入社年月</td>
                    <td className="lbl" style={{width:'15%'}}>退社年月</td>
                    <td className="lbl">勤務先名称</td>
                  </tr>
                  {workHistory.filter(w => w.employer).map((w, i) => (
                    <tr key={i}>
                      <td>{fmt(w.joinDate)}</td>
                      <td>{fmt(w.leaveDate)}</td>
                      <td>{fmt(w.employer)}</td>
                    </tr>
                  ))}
                </tbody></table>
              </>)}

              {/* 所属機関等作成用 Part 1-3 V */}
              <div className="section page-break">
                所属機関等作成用　Part 1・2　Ｖ　—「特定技能（１号・２号）」
              </div>

              <div className="section3">1. 雇用する外国人の氏名</div>
              <table><tbody>
                <tr><td colSpan={4}>{form.familyNameEn} {form.givenNameEn}{(form.familyNameJa || form.givenNameJa) ? `　${form.familyNameJa}　${form.givenNameJa}` : ''}</td></tr>
              </tbody></table>

              <div className="section3">2. 特定技能雇用契約</div>
              <table><tbody>
                <tr><td className="lbl" style={{width:'30%'}}>(1) 雇用契約期間</td><td colSpan={3}>{fmt(form.orgContractStartDate)} 〜 {fmt(form.orgContractEndDate)}</td></tr>
                <tr><td className="lbl">(2) 特定産業分野</td><td>{fmt(form.orgSpecifiedIndustrialField)}</td><td className="lbl">業務区分</td><td>{fmt(form.orgWorkCategory)}</td></tr>
                <tr><td className="lbl">主職種番号</td><td>{fmt(form.orgOccupationNumber)}</td><td className="lbl">追加職種番号</td><td>{fmt(form.orgOccupationNumberAdditional)}</td></tr>
                <tr><td className="lbl">(3) 所定労働時間（週平均）</td><td>{fmt(form.orgWorkHoursWeekly)}時間</td><td className="lbl">（月平均）</td><td>{fmt(form.orgWorkHoursMonthly)}時間</td></tr>
                <tr><td className="lbl">正規労働者と同等か</td><td colSpan={3}>{fmtYesNo(form.orgWorkHoursEquivalent)}</td></tr>
                <tr><td className="lbl">(4) 月額報酬（円）</td><td>{form.salary ? Number(form.salary).toLocaleString() + '円' : '　'}</td><td className="lbl">時間換算基本給</td><td>{form.orgTimeConvertedBasicSalary ? Number(form.orgTimeConvertedBasicSalary).toLocaleString() + '円' : '　'}</td></tr>
                <tr><td className="lbl">日本人同種業務の月額</td><td>{form.orgJapaneseEquivalentSalary ? Number(form.orgJapaneseEquivalentSalary).toLocaleString() + '円' : '　'}</td><td className="lbl">日本人同等以上か</td><td>{fmtYesNo(form.orgSalaryEqualToJapanese)}</td></tr>
                <tr><td className="lbl">(5) 報酬支払方法</td><td colSpan={3}>{yes(form.orgSalaryPaymentCash) ? '現金払い　' : ''}{yes(form.orgSalaryPaymentBank) ? '銀行振込' : ''}</td></tr>
                <tr><td className="lbl">(6) 外国人差別的扱い</td><td>{fmtYesNo(form.orgForeignTreatmentDifference)}</td><td className="lbl">(7) 一時帰国有給</td><td>{fmtYesNo(form.orgPaidHolidayForReturn)}</td></tr>
                <tr><td className="lbl">(8) 分野別雇用基準</td><td>{fmtYesNo(form.orgFieldSpecificEmploymentCriteria)}</td><td className="lbl">(9) 帰国旅費負担</td><td>{fmtYesNo(form.orgReturnTravelExpenses)}</td></tr>
                <tr><td className="lbl">(10) 健康確認措置</td><td>{fmtYesNo(form.orgHealthCheck)}</td><td className="lbl">(11) 適正在留基準</td><td>{fmtYesNo(form.orgProperResidenceCriteria)}</td></tr>
              </tbody></table>

              <div className="section3">3. 特定技能所属機関情報</div>
              <table><tbody>
                <tr><td className="lbl" style={{width:'30%'}}>(1) 名称</td><td colSpan={3}>{fmt(form.orgName)}</td></tr>
                <tr><td className="lbl">(2) 法人番号</td><td>{fmt(form.orgCorporateNumber)}</td><td className="lbl">(3) 雇用保険番号</td><td>{fmt(form.orgEmploymentInsuranceNo)}</td></tr>
                <tr><td className="lbl">(4) 業種コード（主）</td><td>{fmt(form.orgBusinessTypeCode)}</td><td className="lbl">業種コード（他）</td><td>{fmt(form.orgBusinessTypeOtherCode)}</td></tr>
                <tr><td className="lbl">(5) 所在地</td><td colSpan={3}>{fmt(form.orgAddress)}　☎ {fmt(form.orgPhone)}</td></tr>
                <tr><td className="lbl">(6) 資本金</td><td>{form.orgCapital ? Number(form.orgCapital).toLocaleString() + '円' : '　'}</td><td className="lbl">(7) 年間売上高</td><td>{form.orgAnnualSales ? Number(form.orgAnnualSales).toLocaleString() + '円' : '　'}</td></tr>
                <tr><td className="lbl">(8) 常勤職員数</td><td>{form.orgEmployeeCount ? `${form.orgEmployeeCount}名` : '　'}</td><td className="lbl">(9) 代表者</td><td>{fmt(form.position)}</td></tr>
                {form.orgBranchName && <tr><td className="lbl">(10) 勤務先事業所</td><td>{fmt(form.orgBranchName)}</td><td className="lbl">所在地</td><td>{fmt(form.activityDetails)}</td></tr>}
                <tr><td className="lbl">労働保険番号</td><td>{fmt(form.orgLaborInsuranceNo)}</td><td className="lbl">健康・年金保険適用</td><td>{fmtYesNo(form.orgHealthInsuranceMet)}</td></tr>
                <tr><td className="lbl">労災・雇用保険適用</td><td colSpan={3}>{fmtYesNo(form.orgLaborInsuranceMet)}</td></tr>
              </tbody></table>

              {/* 支援計画 */}
              {(form.supportManagerName || form.rsoName) && (<>
                <div className="section3">支援責任者・担当者 / 登録支援機関</div>
                <table><tbody>
                  {form.supportManagerName && <tr><td className="lbl" style={{width:'30%'}}>支援責任者</td><td>{fmt(form.supportManagerName)}　{fmt(form.supportManagerTitle)}</td><td className="lbl">支援担当者</td><td>{fmt(form.supportStaffName)}　{fmt(form.supportStaffTitle)}</td></tr>}
                  {form.rsoName && (<>
                    <tr><td className="lbl">登録支援機関名</td><td colSpan={3}>{fmt(form.rsoName)}（登録番号: {fmt(form.rsoRegNo)}）</td></tr>
                    <tr><td className="lbl">代表者</td><td>{fmt(form.rsoRepresentative)}</td><td className="lbl">対応言語</td><td>{fmt(form.rsoAvailableLanguages)}</td></tr>
                  </>)}
                </tbody></table>
              </>)}

              {/* 取次者（固定） */}
              <div className="section3" style={{marginTop:'10px'}}>※ 取次者</div>
              <table><tbody>
                <tr><td className="lbl" style={{width:'20%'}}>(1) 氏名</td><td colSpan={3}>山口忠士</td></tr>
                <tr><td className="lbl">(3) 所属機関等</td><td colSpan={3}>兵庫県行政書士会</td></tr>
                <tr><td className="lbl">(2) 住所</td><td colSpan={3}>〒665-0864 兵庫県宝塚市泉町22-25 島上マンション南棟1-B</td></tr>
                <tr><td className="lbl">電話番号</td><td colSpan={3}>090-2596-0128</td></tr>
              </tbody></table>

              {/* 申請人署名欄（V型） */}
              <table className="sign-table" style={{ marginTop: "16px" }}>
                <tbody>
                  <tr>
                    <td colSpan={4} style={{ fontWeight: "bold", fontSize: "11px", textAlign: "center", background: "#f0f0f0", letterSpacing: "0.05em", height: "26px" }}>
                      以上の記載内容は事実と相違ありません。
                    </td>
                  </tr>
                  <tr>
                    <td className="lbl" style={{ width: "28%", verticalAlign: "top", paddingTop: "5px", height: "50px" }}>
                      <div style={{ fontSize: "10.5px", fontWeight: "bold" }}>申請人（法定代理人）の署名</div>
                      {(form.familyNameJa || form.givenNameJa || form.familyNameEn || form.givenNameEn) && (
                        <div style={{ fontSize: "9.5px", marginTop: "3px", fontWeight: "normal", color: "#333" }}>
                          氏名：{form.familyNameJa
                            ? `${fmt(form.familyNameJa)}　${fmt(form.givenNameJa)}`
                            : `${fmt(form.familyNameEn)} ${fmt(form.givenNameEn)}`}
                        </div>
                      )}
                    </td>
                    <td style={{ width: "36%" }}></td>
                    <td className="lbl" style={{ width: "16%", textAlign: "center" }}>署名日</td>
                    <td className="sign-date" style={{ width: "20%" }}>　　年　　月　　日</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}

          {/* ── その他種別のフリーフィールド ──────────────────────────────── */}
          {!isNtype && !isTtype && !isRtype && !isPtype && !isVtype && form.freeformPart2Notes && (
            <>
              <div className="section page-break">申請人等作成用　Part 2　— 補足情報</div>
              <table>
                <tbody>
                  <tr>
                    <td style={{ padding: "8px", whiteSpace: "pre-wrap", lineHeight: "1.7" }}>
                      {form.freeformPart2Notes}
                    </td>
                  </tr>
                </tbody>
              </table>
            </>
          )}

          {/* ── 共通：代理人・取次者（R型以外）──────────────────────────────── */}
          {/* R型は申請人用２Ｒ内に含むため、ここでは非R型のみ表示 */}
          {!isRtype && (
            <>
              <div className="section3">{isCoe ? "27." : "22."} 代理人（法定代理人）/ 取次者</div>
              <table>
                <tbody>
                  <tr>
                    <td className="lbl">代理人氏名</td><td>{fmt(form.representativeName)}</td>
                    <td className="lbl">続柄・資格</td><td>{fmt(form.representativeRelationship)}</td>
                  </tr>
                  {form.representativeAddress && (
                    <tr>
                      <td className="lbl">代理人住所</td><td colSpan={3}>{fmt(form.representativeAddress)}</td>
                    </tr>
                  )}
                  <tr>
                    <td className="lbl">取次者氏名</td><td colSpan={3}>山口忠士</td>
                  </tr>
                  <tr>
                    <td className="lbl">所属機関</td><td colSpan={3}>兵庫県行政書士会</td>
                  </tr>
                  <tr>
                    <td className="lbl">取次者住所</td>
                    <td colSpan={3}>〒665-0864 兵庫県宝塚市泉町22-25 島上マンション南棟1-B</td>
                  </tr>
                  <tr>
                    <td className="lbl">取次者電話</td><td colSpan={3}>090-2596-0128</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}

          {/* ══ 所属機関等作成用 Part 1（就労系のみ） ══════════════════════════ */}
          {needsOrg && isNtype && (
            <>
              <div className="section page-break">所属機関等作成用　Part 1 N　— 機関情報・雇用条件</div>

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
                    <td className="lbl">所在地</td><td>{fmt(form.orgAddress)}</td>
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
                    <td style={{ whiteSpace: "pre-wrap", lineHeight: "1.7", minHeight: "60px", padding: "6px" }}>
                      {fmt(form.activityDetails)}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* 機関担当者署名欄 */}
              <table className="sign-table" style={{ marginTop: "10px" }}>
                <tbody>
                  <tr>
                    <td className="lbl" style={{ width: "30%" }}>機関代表者・担当者署名</td>
                    <td style={{ width: "40%" }}></td>
                    <td className="lbl" style={{ width: "15%" }}>署名日</td>
                    <td style={{ width: "15%" }}></td>
                  </tr>
                </tbody>
              </table>

              {/* 所属機関 Part 2（派遣先等） */}
              {form.dispatchOrgName && (
                <>
                  <div className="section page-break">所属機関等作成用　Part 2 N　— 派遣先等（項目 {orgDispatchNo}）</div>
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
                  <table className="sign-table" style={{ marginTop: "8px" }}>
                    <tbody>
                      <tr>
                        <td className="lbl" style={{ width: "30%" }}>機関代表者・担当者署名</td>
                        <td style={{ width: "40%" }}></td>
                        <td className="lbl" style={{ width: "15%" }}>署名日</td>
                        <td style={{ width: "15%" }}></td>
                      </tr>
                    </tbody>
                  </table>
                </>
              )}
            </>
          )}

          {/* 所属機関情報（N型以外・就労系の場合のフリーフィールド） */}
          {needsOrg && !isNtype && form.freeformOrgNotes && (
            <>
              <div className="section page-break">所属機関等作成用</div>
              <table>
                <tbody>
                  <tr>
                    <td style={{ padding: "8px", whiteSpace: "pre-wrap", lineHeight: "1.7" }}>
                      {form.freeformOrgNotes}
                    </td>
                  </tr>
                </tbody>
              </table>
            </>
          )}

          {/* ══ 申請理由書（別紙） ══════════════════════════════════════════════ */}
          {form.applicationStatement && (
            <>
              <div className="section page-break">申請理由書（別紙）</div>
              <table>
                <tbody>
                  <tr>
                    <td style={{ padding: "10px", whiteSpace: "pre-wrap", lineHeight: "2.0", minHeight: "260px", fontSize: "11px" }}>
                      {form.applicationStatement}
                    </td>
                  </tr>
                </tbody>
              </table>
            </>
          )}

          {/* ══ 資格外活動許可申請書（別記第二十八号様式） ═══════════════════════ */}
          {(form.gaikatsuNeeded === "有" ||
            (isRtype && yes(form.partTimeWorkExistsR)) ||
            (isPtype)) && (form.gaikatsuActivityType || form.gaikatsuCurrentActivity || form.gaikatsuEmployerName) && (
            <>
              <div className="section page-break">
                資格外活動許可申請書（別記第二十八号様式・第十九条関係）
              </div>
              <div style={{ fontSize: "9px", textAlign: "right", marginBottom: "6px", color: "#555" }}>
                日本国政府法務省　Ministry of Justice, Government of Japan
              </div>
              <div style={{ textAlign: "center", fontSize: "13px", fontWeight: "bold", border: "2px solid #000", padding: "5px 12px", marginBottom: "10px" }}>
                資格外活動許可申請書<br />
                <span style={{ fontSize: "10px", fontWeight: "normal" }}>APPLICATION FOR PERMISSION TO ENGAGE IN ACTIVITY OTHER THAN THAT PERMITTED UNDER THE STATUS OF RESIDENCE PREVIOUSLY GRANTED</span>
              </div>
              <p style={{ fontSize: "10px", marginBottom: "8px" }}>
                出入国管理及び難民認定法第１９条第２項の規定に基づき，次のとおり資格外活動の許可を申請します。
              </p>

              {/* 1〜9: 申請人基本情報 */}
              <table>
                <tbody>
                  <tr>
                    <td className="lbl">1. 国籍・地域</td>
                    <td>{fmt(form.nationality)}</td>
                    <td className="lbl">2. 生年月日</td>
                    <td>{fmtDate(form.dateOfBirth)}</td>
                  </tr>
                  <tr>
                    <td className="lbl">3. 氏名（ローマ字）</td>
                    <td colSpan={3}>{fmt(form.familyNameEn)}　{fmt(form.givenNameEn)}</td>
                  </tr>
                  <tr>
                    <td className="lbl">4. 性別</td>
                    <td>{fmtSex(form.sex)}</td>
                    <td className="lbl">5. 配偶者の有無</td>
                    <td>{fmt(form.maritalStatus)}</td>
                  </tr>
                  <tr>
                    <td className="lbl">6. 職業</td>
                    <td colSpan={3}>{fmt(form.occupation)}</td>
                  </tr>
                  <tr>
                    <td className="lbl">7. 住居地</td>
                    <td colSpan={3}>{fmt(form.addressInJapan)}</td>
                  </tr>
                  <tr>
                    <td className="lbl">　電話番号</td>
                    <td>{fmt(form.telephoneNo)}</td>
                    <td className="lbl">携帯電話番号</td>
                    <td>{fmt(form.cellularPhoneNo)}</td>
                  </tr>
                  <tr>
                    <td className="lbl">8. 旅券番号</td>
                    <td>{fmt(form.passportNumber)}</td>
                    <td className="lbl">有効期限</td>
                    <td>{fmtDate(form.passportExpiry)}</td>
                  </tr>
                  <tr>
                    <td className="lbl">9. 現在の在留資格</td>
                    <td>{fmt(form.currentStatusOfResidence)}</td>
                    <td className="lbl">在留期間</td>
                    <td>{fmt(form.currentPeriodOfStay)}</td>
                  </tr>
                  <tr>
                    <td className="lbl">　在留期間の満了日</td>
                    <td>{fmtDate(form.currentPeriodExpiry)}</td>
                    <td className="lbl">10. 在留カード番号</td>
                    <td>{fmt(form.residenceCardNumber)}</td>
                  </tr>
                </tbody>
              </table>

              {/* 10. 現在の在留活動の内容 */}
              <table>
                <tbody>
                  <tr>
                    <td className="lbl" style={{ width: "30%" }}>
                      11. 現在の在留活動の内容<br />
                      <span style={{ fontWeight: "normal", fontSize: "9px" }}>(学生は学校名・週間授業時間)</span>
                    </td>
                    <td style={{ whiteSpace: "pre-wrap", minHeight: "50px" }}>
                      {fmt(form.gaikatsuCurrentActivity)}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* 11. 他に従事しようとする活動の内容 */}
              <table>
                <tbody>
                  <tr>
                    <td className="lbl" rowSpan={4} style={{ width: "30%", verticalAlign: "top", paddingTop: "4px" }}>
                      12. 他に従事しようとする<br />活動の内容
                    </td>
                    <td className="lbl" style={{ width: "20%" }}>(1) 職務の内容</td>
                    <td>
                      {form.gaikatsuActivityType === "翻訳・通訳" && "■翻訳・通訳　□語学教師　□その他"}
                      {form.gaikatsuActivityType === "語学教師" && "□翻訳・通訳　■語学教師　□その他"}
                      {form.gaikatsuActivityType === "その他" && `□翻訳・通訳　□語学教師　■その他（${fmt(form.gaikatsuActivityTypeOther)}）`}
                      {!form.gaikatsuActivityType && "□翻訳・通訳　□語学教師　□その他"}
                    </td>
                  </tr>
                  <tr>
                    <td className="lbl">(2) 雇用契約期間</td>
                    <td>{fmt(form.gaikatsuContractPeriod)}</td>
                  </tr>
                  <tr>
                    <td className="lbl">(3) 週間稼働時間</td>
                    <td>{form.gaikatsuWeeklyHours ? `${form.gaikatsuWeeklyHours}時間` : "　"}</td>
                  </tr>
                  <tr>
                    <td className="lbl">(4) 報酬</td>
                    <td>
                      {form.gaikatsuSalary
                        ? `${Number(form.gaikatsuSalary).toLocaleString()}円（${form.gaikatsuSalaryType || "月額"}）`
                        : "　"}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* 12. 勤務先 */}
              <table>
                <tbody>
                  <tr>
                    <td className="lbl" rowSpan={3} style={{ width: "20%", verticalAlign: "top", paddingTop: "4px" }}>
                      13. 勤務先
                    </td>
                    <td className="lbl" style={{ width: "20%" }}>(1) 名称</td>
                    <td>{fmt(form.gaikatsuEmployerName)}</td>
                  </tr>
                  <tr>
                    <td className="lbl">(2) 所在地</td>
                    <td>
                      {fmt(form.gaikatsuEmployerAddress)}
                      {form.gaikatsuEmployerPhone && `　TEL: ${form.gaikatsuEmployerPhone}`}
                    </td>
                  </tr>
                  <tr>
                    <td className="lbl">(3) 業種</td>
                    <td>
                      {["製造", "商業", "教育", "その他"].map(t => (
                        <span key={t} style={{ marginRight: "12px" }}>
                          {form.gaikatsuEmployerBusinessType === t ? "■" : "□"}{t}
                        </span>
                      ))}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* 署名欄 */}
              <table className="sign-table" style={{ marginTop: "14px" }}>
                <tbody>
                  {/* 宣誓文 */}
                  <tr>
                    <td colSpan={4} style={{
                      fontWeight: "bold",
                      fontSize: "11px",
                      textAlign: "center",
                      background: "#f0f0f0",
                      letterSpacing: "0.05em",
                      height: "28px",
                    }}>
                      以上の記載内容は事実と相違ありません。
                    </td>
                  </tr>
                  {/* 署名者ラベル ｜ 署名スペース ｜ 署名日 */}
                  <tr>
                    <td className="lbl" style={{ width: "28%", verticalAlign: "top", paddingTop: "5px", height: "50px" }}>
                      <div style={{ fontSize: "10.5px", fontWeight: "bold" }}>申請人（法定代理人）の署名</div>
                      {(form.familyNameJa || form.givenNameJa || form.familyNameEn || form.givenNameEn) && (
                        <div style={{ fontSize: "9.5px", marginTop: "3px", fontWeight: "normal", color: "#333" }}>
                          氏名：{form.familyNameJa
                            ? `${fmt(form.familyNameJa)}　${fmt(form.givenNameJa)}`
                            : `${fmt(form.familyNameEn)} ${fmt(form.givenNameEn)}`}
                        </div>
                      )}
                    </td>
                    <td style={{ width: "36%" }}></td>
                    <td className="lbl" style={{ width: "16%", textAlign: "center" }}>署名日</td>
                    <td className="sign-date" style={{ width: "20%" }}>　　年　　月　　日</td>
                  </tr>
                </tbody>
              </table>

              {/* 取次者 */}
              <div className="section3" style={{ marginTop: "10px" }}>※ 取次者</div>
              <table>
                <tbody>
                  <tr>
                    <td className="lbl" style={{ width: "20%" }}>(1) 氏名</td>
                    <td colSpan={3}>山口忠士</td>
                  </tr>
                  <tr>
                    <td className="lbl">(3) 所属機関等</td>
                    <td colSpan={3}>兵庫県行政書士会</td>
                  </tr>
                  <tr>
                    <td className="lbl">(2) 住所</td>
                    <td colSpan={3}>〒665-0864 兵庫県宝塚市泉町22-25 島上マンション南棟1-B</td>
                  </tr>
                  <tr>
                    <td className="lbl">電話番号</td>
                    <td colSpan={3}>090-2596-0128</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}

          {/* ── 申請人署名欄（R型・V型以外：申請人等作成用の末尾） ─────────────── */}
          {/* R型はR型ブロック内、V型はV型ブロック内に署名欄を出力済みのため除外 */}
          {!isRtype && !isVtype && (
            <table className="sign-table" style={{ marginTop: "16px" }}>
              <tbody>
                <tr>
                  <td colSpan={4} style={{ fontWeight: "bold", fontSize: "11px", textAlign: "center", background: "#f0f0f0", letterSpacing: "0.05em", height: "26px" }}>
                    以上の記載内容は事実と相違ありません。
                  </td>
                </tr>
                <tr>
                  <td className="lbl" style={{ width: "28%", verticalAlign: "top", paddingTop: "5px", height: "50px" }}>
                    <div style={{ fontSize: "10.5px", fontWeight: "bold" }}>申請人（法定代理人）の署名</div>
                    {(form.familyNameJa || form.givenNameJa || form.familyNameEn || form.givenNameEn) && (
                      <div style={{ fontSize: "9.5px", marginTop: "3px", fontWeight: "normal", color: "#333" }}>
                        氏名：{form.familyNameJa
                          ? `${fmt(form.familyNameJa)}　${fmt(form.givenNameJa)}`
                          : `${fmt(form.familyNameEn)} ${fmt(form.givenNameEn)}`}
                      </div>
                    )}
                  </td>
                  <td style={{ width: "36%" }}></td>
                  <td className="lbl" style={{ width: "16%", textAlign: "center" }}>署名日</td>
                  <td className="sign-date" style={{ width: "20%" }}>　　年　　月　　日</td>
                </tr>
              </tbody>
            </table>
          )}

          {/* ── フッター ──────────────────────────────────────────────────── */}
          <div style={{
            marginTop: "18px", paddingTop: "8px", borderTop: "1px solid #bbb",
            fontSize: "9px", color: "#888", display: "flex", justifyContent: "space-between"
          }}>
            <span>行政書士法人 JLS　（yamaguchi@jls-gyosei.jp）</span>
            <span>出力日：{today}　|　案件番号：{app.caseNumber}</span>
          </div>

        </div>
      </body>
    </html>
  );
}

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
  const isNtype = ['N', 'L', 'I', 'V'].includes(cat);
  const isTtype = cat === 'T';
  const isRtype = cat === 'R';
  const isPtype = cat === 'P';
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
          body{font-family:"MS Mincho","ＭＳ 明朝","Hiragino Mincho ProN",serif;font-size:11px;color:#000;background:#f3f4f6;}
          .page{background:#fff;max-width:210mm;margin:0 auto;padding:14mm 16mm;min-height:297mm;}
          @media screen{.page{margin:20px auto;box-shadow:0 4px 24px rgba(0,0,0,.12);border-radius:4px;}}
          @media print{body{background:#fff;}.page{padding:8mm 10mm;max-width:100%;min-height:auto;}.no-print{display:none!important;}}

          .form-title{text-align:center;font-size:14px;font-weight:bold;border:2px solid #000;padding:6px 12px;margin-bottom:8px;}
          .form-subtitle{font-size:9px;text-align:right;margin-bottom:10px;color:#555;}

          table{width:100%;border-collapse:collapse;margin-bottom:6px;}
          td,th{border:1px solid #555;padding:3px 5px;vertical-align:middle;font-size:10px;}
          .lbl{background:#e8e8e8;font-weight:bold;white-space:nowrap;width:25%;}
          .lbl-w20{width:20%;}

          .section{background:#222;color:#fff;font-weight:bold;font-size:11px;padding:4px 8px;margin:12px 0 4px;}
          .section2{background:#555;color:#fff;font-size:10px;padding:2px 6px;margin:6px 0 3px;}
          .section3{background:#888;color:#fff;font-size:9.5px;padding:2px 6px;margin:4px 0 2px;}

          .sign-table td{height:38px;}
          .page-break{page-break-before:always;}
          th{background:#d0d0d0;font-weight:bold;}
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
              <table className="sign-table" style={{marginTop:'10px'}}>
                <tbody>
                  <tr>
                    <td className="lbl" style={{width:'35%'}}>扶養者の署名</td>
                    <td style={{width:'35%'}}></td>
                    <td className="lbl" style={{width:'12%'}}>署名日</td>
                    <td style={{width:'18%'}}>　　年　　月　　日</td>
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

          {/* ── その他種別のフリーフィールド ──────────────────────────────── */}
          {!isNtype && !isTtype && !isRtype && !isPtype && form.freeformPart2Notes && (
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

          {/* ── 申請人署名欄（1か所のみ） ──────────────────────────────────── */}
          <table className="sign-table" style={{ marginTop: "16px" }}>
            <tbody>
              <tr>
                <td className="lbl" style={{ width: "40%" }}>申請人（法定代理人）の署名／申請書作成年月日</td>
                <td style={{ width: "30%" }}></td>
                <td className="lbl" style={{ width: "12%" }}>署名日</td>
                <td style={{ width: "18%" }}>　　年　　月　　日</td>
              </tr>
            </tbody>
          </table>

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

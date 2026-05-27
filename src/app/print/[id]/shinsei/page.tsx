import { auth } from "@/lib/auth";
import { db, applications, applicantMaster, organizationMaster } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import { VISA_TYPE_LABELS, APPLICATION_TYPE_LABELS } from "@/lib/utils";
import type { ApplicationFormData, FamilyMember } from "@/lib/form-types";
import { PrintTrigger } from "../print-trigger";

function fmt(v: string | null | undefined) { return v || "　"; }
function fmtDate(v: string | null | undefined) {
  if (!v) return "　";
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}
function fmtMoney(v: string | null | undefined) {
  if (!v) return "　";
  const n = Number(String(v).replace(/,/g, ""));
  return isNaN(n) ? v : `${n.toLocaleString()}円`;
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
    ? await db.select().from(organizationMaster).where(eq(organizationMaster.id, app.organizationId)).limit(1).then(r => r[0])
    : null;

  const form = (app.formData ?? {}) as Partial<ApplicationFormData>;
  const visaLabel = VISA_TYPE_LABELS[app.visaType] ?? app.visaType;
  const appTypeLabel = APPLICATION_TYPE_LABELS[app.applicationType] ?? app.applicationType;
  const today = `${new Date().getFullYear()}年${new Date().getMonth() + 1}月${new Date().getDate()}日`;
  const familyMembers = (form.familyInJapan ?? []) as FamilyMember[];

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

          /* タイトル */
          .form-title{text-align:center;font-size:15px;font-weight:bold;border:2px solid #000;padding:6px 12px;margin-bottom:12px;}
          .form-subtitle{font-size:10px;text-align:right;margin-bottom:10px;color:#555;}

          /* テーブル共通 */
          table{width:100%;border-collapse:collapse;margin-bottom:8px;}
          td,th{border:1px solid #555;padding:3px 5px;vertical-align:middle;font-size:10.5px;}
          .lbl{background:#e8e8e8;font-weight:bold;width:25%;white-space:nowrap;}
          .lbl2{background:#e8e8e8;font-weight:bold;width:18%;white-space:nowrap;}
          .val{width:25%;}
          .val-wide{width:75%;}
          .val-full{width:100%;}

          /* セクションヘッダー */
          .section{background:#333;color:#fff;font-weight:bold;font-size:11px;padding:3px 6px;margin:10px 0 4px;}
          .section2{background:#666;color:#fff;font-size:10.5px;padding:2px 6px;margin:6px 0 3px;}

          /* 署名欄 */
          .sign-table td{height:36px;}

          /* ページ区切り */
          .page-break{page-break-before:always;}
        `}</style>
      </head>
      <body>
        <PrintTrigger applicationId={id} />
        <div className="page" style={{ paddingTop: "56px" }}>

          {/* ══ タイトル ══════════════════════════════════════════════════════ */}
          <div className="form-title">{appTypeLabel}</div>
          <div className="form-subtitle">作成日：{today}　|　案件番号：{app.caseNumber}</div>

          {/* ══ 申請人等作成用 Part 1 ══════════════════════════════════════════ */}
          <div className="section">申請人等作成用　Part 1　—　基本情報</div>

          <table>
            <tbody>
              <tr>
                <td className="lbl">1. 国籍・地域</td><td className="val">{fmt(form.nationality)}</td>
                <td className="lbl">2. 生年月日</td><td className="val">{fmtDate(form.dateOfBirth)}</td>
              </tr>
              <tr>
                <td className="lbl">3. 氏名（ローマ字）</td>
                <td className="val-wide" colSpan={3}>{fmt(form.familyNameEn)} {fmt(form.givenNameEn)}</td>
              </tr>
              <tr>
                <td className="lbl">　 氏名（漢字）</td>
                <td className="val-wide" colSpan={3}>{form.familyNameJa || form.givenNameJa ? `${fmt(form.familyNameJa)} ${fmt(form.givenNameJa)}` : "　"}</td>
              </tr>
              <tr>
                <td className="lbl">4. 性別</td><td className="val">{fmt(form.sex)}</td>
                <td className="lbl">5. 出生地</td><td className="val">{fmt(form.placeOfBirth)}</td>
              </tr>
              <tr>
                <td className="lbl">6. 配偶者の有無</td><td className="val">{fmt(form.maritalStatus)}</td>
                <td className="lbl">7. 職業</td><td className="val">{fmt(form.occupation)}</td>
              </tr>
              <tr>
                <td className="lbl">8. 本国の居住地</td><td className="val-wide" colSpan={3}>{fmt(form.homeTownCity)}</td>
              </tr>
              <tr>
                <td className="lbl">9. 日本の住居地</td><td className="val-wide" colSpan={3}>{fmt(form.addressInJapan)}</td>
              </tr>
              <tr>
                <td className="lbl">　 電話番号</td><td className="val">{fmt(form.telephoneNo)}</td>
                <td className="lbl">　 携帯電話番号</td><td className="val">{fmt(form.cellularPhoneNo)}</td>
              </tr>
              <tr>
                <td className="lbl">10. パスポート番号</td><td className="val">{fmt(form.passportNumber)}</td>
                <td className="lbl">　  有効期限</td><td className="val">{fmtDate(form.passportExpiry)}</td>
              </tr>
              <tr>
                <td className="lbl">11. 現在の在留資格</td><td className="val">{fmt(form.currentStatusOfResidence)}</td>
                <td className="lbl">　  在留期間</td><td className="val">{fmt(form.currentPeriodOfStay)}</td>
              </tr>
              <tr>
                <td className="lbl">　  在留期間満了日</td><td className="val">{fmtDate(form.currentPeriodExpiry)}</td>
                <td className="lbl">12. 在留カード番号</td><td className="val">{fmt(form.residenceCardNumber)}</td>
              </tr>
              {app.applicationType === "change" && (
                <tr>
                  <td className="lbl">13. 希望する在留資格</td><td className="val">{fmt(form.desiredStatusOfResidence)}</td>
                  <td className="lbl">　  希望する在留期間</td><td className="val">{fmt(form.desiredPeriodOfStay)}</td>
                </tr>
              )}
              <tr>
                <td className="lbl">{app.applicationType === "change" ? "14. 変更の理由" : "更新の理由"}</td>
                <td className="val-wide" colSpan={3} style={{ whiteSpace: "pre-wrap" }}>{fmt(form.reasonForApplication)}</td>
              </tr>
              <tr>
                <td className="lbl">15. 犯罪記録の有無</td>
                <td className="val-wide" colSpan={3}>
                  {form.criminalRecord === "有"
                    ? `有 — ${fmt(form.criminalRecordDetail)}`
                    : "無（No）"}
                </td>
              </tr>
            </tbody>
          </table>

          {/* 在日親族 */}
          <div className="section2">16. 在日親族及び同居者</div>
          {familyMembers.length === 0 ? (
            <table><tbody><tr><td style={{ textAlign: "center", color: "#777" }}>なし</td></tr></tbody></table>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>続柄</th><th>氏名</th><th>生年月日</th><th>国籍</th>
                  <th>勤務先・通学先</th><th>同居</th><th>在留カード番号</th>
                </tr>
              </thead>
              <tbody>
                {familyMembers.map((m, i) => (
                  <tr key={i}>
                    <td>{m.relationship}</td><td>{m.name}</td>
                    <td>{fmtDate(m.dateOfBirth)}</td><td>{m.nationality}</td>
                    <td>{m.placeOfEmployment}</td>
                    <td style={{ textAlign: "center" }}>{m.residingTogether ? "○" : "×"}</td>
                    <td>{m.residenceCardNumber}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* 署名欄 */}
          <table className="sign-table" style={{ marginTop: "8px" }}>
            <tbody>
              <tr>
                <td className="lbl" style={{ width: "30%" }}>申請人署名</td>
                <td style={{ width: "40%" }}></td>
                <td className="lbl" style={{ width: "15%" }}>署名日</td>
                <td style={{ width: "15%" }}></td>
              </tr>
            </tbody>
          </table>

          {/* ══ 申請人等作成用 Part 2 ══════════════════════════════════════════ */}
          <div className="section page-break" style={{ marginTop: "16px" }}>申請人等作成用　Part 2　—　学歴・勤務先・給与（技術・人文・国際業務等）</div>

          <table>
            <tbody>
              <tr>
                <td className="lbl">17. 勤務先名称</td><td className="val">{fmt(form.employerName)}</td>
                <td className="lbl">　  支店・事業所名</td><td className="val">{fmt(form.employerBranchName)}</td>
              </tr>
              <tr>
                <td className="lbl">　  所在地</td><td className="val-wide" colSpan={3}>{fmt(form.employerAddress)}</td>
              </tr>
              <tr>
                <td className="lbl">　  電話番号</td><td className="val">{fmt(form.employerPhone)}</td>
                <td className="lbl">職務上の地位</td><td className="val">{fmt(form.position)}</td>
              </tr>
              <tr>
                <td className="lbl">　  業務内容</td><td className="val-wide" colSpan={3} style={{ whiteSpace: "pre-wrap" }}>{fmt(form.jobDescription)}</td>
              </tr>
              <tr>
                <td className="lbl">　  通算在職年数</td><td className="val">{fmt(form.yearsOfService)}</td>
                <td className="lbl">　  月額給与</td><td className="val">{fmtMoney(form.monthlySalary)}</td>
              </tr>
              <tr>
                <td className="lbl">　  年額給与</td><td className="val">{fmtMoney(form.annualSalary)}</td>
                <td className="lbl">　  給与形態</td><td className="val">{fmt(form.salaryType)}</td>
              </tr>
              <tr>
                <td className="lbl">　  資格等</td><td className="val-wide" colSpan={3}>{fmt(form.qualifications)}</td>
              </tr>
              <tr>
                <td className="lbl">18. 最終学歴（国）</td><td className="val">{fmt(form.educationCountry)}</td>
                <td className="lbl">　  学位・区分</td><td className="val">{fmt(form.educationDegree)}</td>
              </tr>
              <tr>
                <td className="lbl">　  学校名</td><td className="val">{fmt(form.educationSchoolName)}</td>
                <td className="lbl">　  卒業年月日</td><td className="val">{fmtDate(form.educationGraduationDate)}</td>
              </tr>
              <tr>
                <td className="lbl">19. 専攻・専門分野</td><td className="val-wide" colSpan={3}>{fmt(form.majorField)}</td>
              </tr>
            </tbody>
          </table>

          {/* ══ 所属機関等作成用 Part 1 ═══════════════════════════════════════ */}
          <div className="section" style={{ marginTop: "14px" }}>所属機関等作成用　Part 1　—　機関情報</div>

          <table>
            <tbody>
              <tr>
                <td className="lbl">1. 機関の名称</td><td className="val">{fmt(form.orgName)}</td>
                <td className="lbl">　 法人番号</td><td className="val">{fmt(form.orgCorporateNumber)}</td>
              </tr>
              <tr>
                <td className="lbl">　 支店・事業所名</td><td className="val">{fmt(form.orgBranchName)}</td>
                <td className="lbl">　 雇用保険番号</td><td className="val">{fmt(form.orgEmploymentInsuranceNo)}</td>
              </tr>
              <tr>
                <td className="lbl">　 事業内容（業種）</td><td className="val-wide" colSpan={3}>{fmt(form.orgBusinessType)}</td>
              </tr>
              <tr>
                <td className="lbl">　 所在地</td><td className="val-wide" colSpan={3}>{fmt(form.orgAddress)}</td>
              </tr>
              <tr>
                <td className="lbl">　 電話番号</td><td className="val">{fmt(form.orgPhone)}</td>
                <td className="lbl">　 契約の形態</td><td className="val">{fmt(form.contractType)}</td>
              </tr>
              <tr>
                <td className="lbl">　 資本金</td><td className="val">{fmtMoney(form.orgCapital)}</td>
                <td className="lbl">　 年間売上高</td><td className="val">{fmtMoney(form.orgAnnualSales)}</td>
              </tr>
              <tr>
                <td className="lbl">　 職員数（全体）</td><td className="val">{form.orgEmployeeCount ? `${form.orgEmployeeCount}名` : "　"}</td>
                <td className="lbl">　 職員数（外国人）</td><td className="val">{form.orgForeignEmployeeCount ? `${form.orgForeignEmployeeCount}名` : "　"}</td>
              </tr>
            </tbody>
          </table>

          <div className="section2">雇用条件・採用理由</div>
          <table>
            <tbody>
              <tr>
                <td className="lbl">雇用契約開始日</td><td className="val">{fmtDate(form.contractStartDate)}</td>
                <td className="lbl">雇用契約終了日</td><td className="val">{form.contractEndDate ? fmtDate(form.contractEndDate) : "無期"}</td>
              </tr>
              <tr>
                <td className="lbl">就労開始予定日</td><td className="val">{fmtDate(form.workStartDate)}</td>
                <td className="lbl">退職金制度</td><td className="val">{fmt(form.severancePay)}</td>
              </tr>
              <tr>
                <td className="lbl">健康保険</td><td className="val">{fmt(form.healthInsurance)}</td>
                <td className="lbl">厚生年金</td><td className="val">{fmt(form.welfarePension)}</td>
              </tr>
              <tr>
                <td className="lbl">雇用保険</td><td className="val">{fmt(form.employmentInsurance)}</td>
                <td className="lbl"></td><td className="val"></td>
              </tr>
              <tr>
                <td className="lbl">採用理由</td>
                <td className="val-wide" colSpan={3} style={{ whiteSpace: "pre-wrap", minHeight: "48px" }}>{fmt(form.reasonForHiring)}</td>
              </tr>
            </tbody>
          </table>

          {/* 機関担当者署名 */}
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

          {/* ══ 申請理由書 ════════════════════════════════════════════════════ */}
          {form.applicationStatement && (
            <>
              <div className="section page-break" style={{ marginTop: "16px" }}>申請理由書（別紙）</div>
              <table>
                <tbody>
                  <tr>
                    <td style={{ padding: "8px", whiteSpace: "pre-wrap", lineHeight: "1.8", minHeight: "200px" }}>
                      {form.applicationStatement}
                    </td>
                  </tr>
                </tbody>
              </table>
            </>
          )}

          {/* フッター */}
          <div style={{ marginTop: "16px", paddingTop: "8px", borderTop: "1px solid #ccc", fontSize: "9px", color: "#888", display: "flex", justifyContent: "space-between" }}>
            <span>行政書士法人 JLS　（yamaguchi@jls-gyosei.jp）</span>
            <span>出力日：{today}　|　案件番号：{app.caseNumber}</span>
          </div>
        </div>
      </body>
    </html>
  );
}

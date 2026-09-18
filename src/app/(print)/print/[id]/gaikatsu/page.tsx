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

  const { form, isRtype, isPtype } = data;

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
          <div className="section">
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
                <td style={{ whiteSpace: "pre-wrap", minHeight: "24px" }}>
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
                  {(form.familyNameEn || form.givenNameEn) && (
                    <div style={{ fontSize: "9.5px", marginTop: "3px", fontWeight: "normal", color: "#333" }}>
                      氏名：{fmt(form.familyNameEn)} {fmt(form.givenNameEn)}
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
        </div>
      )}
    </>
  );
}

/**
 * RASENS（在留申請オンラインシステム）自動入力ツール
 *
 * JLSシステムの申請データをブックマークレットに変換し、
 * RASENSのフォームに自動入力するためのロジック。
 *
 * RASENSのフォームは日本語ラベルを持つHTMLフォームのため、
 * ラベルテキストマッチングで各フィールドを検索・入力する。
 */

import type { ApplicationFormData } from "@/lib/form-types";

// ─── RASENS フィールドマッピング（ラベルテキスト → JLS値） ─────────────────
export interface RasensField {
  /** RASENSページ上のラベルテキスト（部分一致） */
  label: string;
  /** 入力する値 */
  value: string;
  /** フィールドの種類 */
  type?: "text" | "select" | "radio" | "textarea" | "date";
  /** ラジオボタンの場合、対応するオプション */
  radioOption?: string;
  /** メモ（転記支援シート表示用） */
  note?: string;
}

/** JLSフォームデータからRASENSフィールド一覧を生成 */
export function buildRasensFields(
  form: Partial<ApplicationFormData>,
  applicant?: {
    familyNameEn?: string;
    givenNameEn?: string;
    familyNameJa?: string | null;
    givenNameJa?: string | null;
    nationality?: string;
    dateOfBirth?: string | null;
    gender?: string | null;
    passportNumber?: string | null;
    residenceCardNumber?: string | null;
    phone?: string | null;
  }
): RasensField[] {
  const f = form;

  // 値のフォールバック（applicantMaster or formData）
  const nationality    = f.nationality    || applicant?.nationality    || "";
  const familyNameEn   = f.familyNameEn   || applicant?.familyNameEn   || "";
  const givenNameEn    = f.givenNameEn    || applicant?.givenNameEn    || "";
  const familyNameJa   = f.familyNameJa   || applicant?.familyNameJa   || "";
  const givenNameJa    = f.givenNameJa    || applicant?.givenNameJa    || "";
  const dob            = f.dateOfBirth    || applicant?.dateOfBirth    || "";
  const sex            = f.sex            || applicant?.gender         || "";
  const passportNum    = f.passportNumber || applicant?.passportNumber || "";
  const residenceCard  = f.residenceCardNumber || applicant?.residenceCardNumber || "";
  const phone          = f.telephoneNo    || applicant?.phone          || "";
  const cellPhone      = f.cellularPhoneNo || "";

  // 住所の組み立て
  const address = (() => {
    if (f.prefectureInJapan || f.cityInJapan || f.addressLineInJapan) {
      const zip = f.postalCodeInJapan ? `〒${f.postalCodeInJapan}　` : "";
      return `${zip}${f.prefectureInJapan ?? ""}${f.cityInJapan ?? ""}${f.addressLineInJapan ?? ""}`;
    }
    return f.addressInJapan || "";
  })();

  const fields: RasensField[] = [
    // ── 申請人 基本情報 ─────────────────────────────────────────────────
    {
      label: "国籍・地域",
      value: nationality,
      note: "申請人の国籍",
    },
    {
      label: "生年月日",
      value: dob,
      type: "date",
      note: "YYYY-MM-DD形式",
    },
    {
      label: "氏名（ローマ字）",
      value: `${familyNameEn}　${givenNameEn}`.trim(),
      note: "姓　名",
    },
    ...(familyNameJa || givenNameJa
      ? [{
          label: "氏名（漢字等）",
          value: `${familyNameJa}　${givenNameJa}`.trim(),
          note: "漢字・カナ氏名",
        }]
      : []),
    {
      label: "性別",
      value: sex === "男" ? "1" : sex === "女" ? "2" : sex,
      type: "radio" as const,
      radioOption: sex,
      note: sex,
    },
    {
      label: "住居地",
      value: address,
      note: "日本の住所",
    },
    {
      label: "電話番号",
      value: phone,
      note: "固定電話",
    },
    ...(cellPhone
      ? [{
          label: "携帯電話番号",
          value: cellPhone,
          note: "携帯電話",
        }]
      : []),
    {
      label: "旅券番号",
      value: passportNum,
      note: "パスポート番号",
    },
    {
      label: "有効期限",
      value: f.passportExpiry || "",
      type: "date" as const,
      note: "旅券有効期限 YYYY-MM-DD",
    },

    // ── 在留情報 ──────────────────────────────────────────────────────────
    {
      label: "現在の在留資格",
      value: f.currentStatusOfResidence || "",
      note: "現在のビザ種別",
    },
    {
      label: "在留期間",
      value: f.currentPeriodOfStay || "",
      note: "現在の在留期間",
    },
    {
      label: "在留期間の満了日",
      value: f.currentPeriodExpiry || "",
      type: "date" as const,
      note: "在留期間満了日 YYYY-MM-DD",
    },
    {
      label: "在留カード番号",
      value: residenceCard,
      note: "在留カード番号",
    },
    {
      label: "希望する在留期間",
      value: f.desiredPeriodOfStay || "",
      note: "更新後の希望在留期間",
    },

    // ── 在留状況 ──────────────────────────────────────────────────────────
    ...(f.reasonForApplication
      ? [{
          label: "更新の理由",
          value: f.reasonForApplication,
          type: "textarea" as const,
          note: "申請理由",
        }]
      : []),
    {
      label: "犯罪記録",
      value: f.criminalRecord === "有" ? "1" : "0",
      type: "radio" as const,
      radioOption: f.criminalRecord || "無",
      note: f.criminalRecord || "無",
    },
    {
      label: "退去強制歴",
      value: f.deportationHistory === "有" ? "1" : "0",
      type: "radio" as const,
      radioOption: f.deportationHistory || "無",
      note: f.deportationHistory || "無",
    },

    // ── 扶養者情報（家族滞在の場合） ─────────────────────────────────────
    ...(f.supporterFamilyNameEn
      ? [
          {
            label: "扶養者　氏名（ローマ字）",
            value: `${f.supporterFamilyNameEn ?? ""}　${f.supporterGivenNameEn ?? ""}`.trim(),
            note: "扶養者の氏名（英字）",
          },
          ...(f.supporterFamilyNameJa
            ? [{
                label: "扶養者　氏名（漢字等）",
                value: `${f.supporterFamilyNameJa ?? ""}　${f.supporterGivenNameJa ?? ""}`.trim(),
                note: "扶養者の氏名（漢字）",
              }]
            : []),
          {
            label: "扶養者　生年月日",
            value: f.supporterDob || "",
            type: "date" as const,
            note: "扶養者の生年月日",
          },
          {
            label: "扶養者　国籍・地域",
            value: f.supporterNationality || "",
            note: "扶養者の国籍",
          },
          {
            label: "扶養者　在留資格",
            value: f.supporterStatusOfResidence || "",
            note: "扶養者のビザ種別",
          },
          {
            label: "扶養者　在留期間",
            value: f.supporterPeriodOfStay || "",
            note: "扶養者の在留期間",
          },
          {
            label: "扶養者　在留期間の満了日",
            value: f.supporterPeriodExpiry || "",
            type: "date" as const,
            note: "扶養者の在留期間満了日",
          },
          {
            label: "扶養者　在留カード番号",
            value: f.supporterResidenceCard || "",
            note: "扶養者の在留カード番号",
          },
          {
            label: "申請人との関係",
            value: f.supporterRelationship || "",
            note: "申請人との続柄",
          },
          {
            label: "扶養者　勤務先名称",
            value: f.supporterEmployer || "",
            note: "扶養者の勤務先",
          },
          ...(f.supporterAnnualIncome
            ? [{
                label: "年収",
                value: String(f.supporterAnnualIncome),
                note: "扶養者の年収（円）",
              }]
            : []),
        ]
      : []),

    // ── 取次者情報（行政書士法人JLS固定） ────────────────────────────────
    {
      label: "取次者　氏名",
      value: "山口忠士",
      note: "行政書士",
    },
    {
      label: "取次者　電話番号",
      value: "090-2596-0128",
      note: "取次者の電話番号",
    },
    {
      label: "取次者　所属機関等",
      value: "兵庫県行政書士会",
      note: "所属機関",
    },
    {
      label: "取次者　住所",
      value: "〒665-0864 兵庫県宝塚市泉町22-25 島上マンション南棟1-B",
      note: "取次者の住所",
    },
  ];

  // 空値を除外
  return fields.filter((f) => f.value && f.value.trim() !== "");
}

/** ブックマークレット用のJavaScriptを生成 */
export function generateBookmarklet(fields: RasensField[], applicantName: string): string {
  const dataJson = JSON.stringify(fields.map((f) => ({
    l: f.label,
    v: f.value,
    t: f.type || "text",
    r: f.radioOption || "",
  })));

  const js = `(function(){
var F=${dataJson};
var nm=${JSON.stringify(applicantName)};
var ok=[],ng=[];

function setNative(el,val){
  try{
    var p=el.tagName==='SELECT'?HTMLSelectElement.prototype:
          el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:
          HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(p,'value').set.call(el,val);
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
    return true;
  }catch(e){el.value=val;return true;}
}

function findInput(label){
  var els=Array.from(document.querySelectorAll('label,th,td,dt,span,p,div'));
  for(var i=0;i<els.length;i++){
    var el=els[i];
    var txt=(el.textContent||'').trim();
    if(!txt.includes(label))continue;
    var inp=null;
    if(el.htmlFor)inp=document.getElementById(el.htmlFor);
    if(!inp){
      var sib=el.nextElementSibling;
      while(sib&&!inp){
        inp=sib.querySelector('input:not([type=hidden]),select,textarea');
        if(!inp&&['INPUT','SELECT','TEXTAREA'].includes(sib.tagName))inp=sib;
        sib=sib.nextElementSibling;
      }
    }
    if(!inp){
      var par=el.parentElement;
      if(par){
        var next=par.nextElementSibling;
        if(next)inp=next.querySelector('input:not([type=hidden]),select,textarea');
      }
    }
    if(inp)return inp;
  }
  return null;
}

function fillRadio(label,opt){
  var inputs=document.querySelectorAll('input[type=radio]');
  for(var i=0;i<inputs.length;i++){
    var lbl=document.querySelector('label[for="'+inputs[i].id+'"]');
    var txt=lbl?(lbl.textContent||''):(inputs[i].parentElement.textContent||'');
    if(txt.includes(opt)||txt.includes(label)){
      inputs[i].checked=true;
      inputs[i].dispatchEvent(new Event('change',{bubbles:true}));
      return true;
    }
  }
  return false;
}

F.forEach(function(f){
  var filled=false;
  if(f.t==='radio'){
    filled=fillRadio(f.l,f.r||f.v);
  }else{
    var inp=findInput(f.l);
    if(inp){
      if(inp.tagName==='SELECT'){
        var opts=Array.from(inp.options);
        var match=opts.find(function(o){return o.text.includes(f.v)||o.value===f.v;});
        if(match){inp.value=match.value;inp.dispatchEvent(new Event('change',{bubbles:true}));filled=true;}
        else{setNative(inp,f.v);filled=true;}
      }else{
        filled=setNative(inp,f.v);
      }
    }
  }
  (filled?ok:ng).push(f.l+': '+f.v);
});

var msg='【JLS自動入力】'+nm+'\\n'+'─'.repeat(30)+'\\n'+
  '✓ 入力完了: '+ok.length+'件\\n'+
  (ng.length?'✗ 未入力: '+ng.length+'件（手動入力してください）\\n\\n未入力項目:\\n'+ng.join('\\n'):'');
alert(msg);
})()`;

  return `javascript:${encodeURIComponent(js)}`;
}

/** 転記支援シート用のセクション分けデータを生成 */
export function buildTransferSections(fields: RasensField[]) {
  const sections: { title: string; fields: RasensField[] }[] = [
    { title: "申請人 基本情報", fields: [] },
    { title: "在留・旅券情報", fields: [] },
    { title: "申請内容", fields: [] },
    { title: "扶養者情報", fields: [] },
    { title: "取次者情報（固定）", fields: [] },
  ];

  const basicLabels = ["国籍・地域","生年月日","氏名","性別","住居地","電話番号","携帯電話番号"];
  const visaLabels  = ["旅券番号","有効期限","在留資格","在留期間","在留カード"];
  const appLabels   = ["希望する","更新の理由","犯罪","退去強制"];
  const supLabels   = ["扶養者"];
  const agentLabels = ["取次者"];

  fields.forEach((f) => {
    const l = f.label;
    if (agentLabels.some((k) => l.includes(k))) sections[4].fields.push(f);
    else if (supLabels.some((k) => l.includes(k))) sections[3].fields.push(f);
    else if (appLabels.some((k) => l.includes(k))) sections[2].fields.push(f);
    else if (visaLabels.some((k) => l.includes(k))) sections[1].fields.push(f);
    else sections[0].fields.push(f);
  });

  return sections.filter((s) => s.fields.length > 0);
}

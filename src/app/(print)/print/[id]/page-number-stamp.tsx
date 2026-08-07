"use client";

import { useEffect } from "react";

/** 96dpi基準でのCSS上の mm→px 換算（1mm = 96/25.4 px） */
const PX_PER_MM = 96 / 25.4;
/** A4縦の高さ（mm） */
const PAGE_HEIGHT_MM = 297;

/** :root のCSS変数からmm値を読む（未設定時はフォールバック値） */
function readMarginMm(varName: string, fallbackMm: number): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName);
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallbackMm;
}

/**
 * 申請書PDFの右上に「書類種別＋ページ番号」を表示するスタンプ。
 *
 * ・画面プレビュー: 各フォームページ（.page カード）の右上に書類種別のみ表示。
 *   （画面のカード数と実際の印刷枚数は一致しないため、番号は画面では出さない）
 * ・印刷/PDF保存時: beforeprint で印刷レイアウトの実際の内容の高さを計測し、
 *   1枚あたりの印字可能高さ（297mm − 上下余白）で割って物理シート数を算出。
 *   各シートの先頭位置に「申請人用　1/2」形式のスタンプを絶対配置で差し込む。
 *   印刷は連続フロー（枚数最小化）のままなので、余計なページや空白は増えない。
 * ・afterprint で印刷用スタンプを除去し、画面表示を元に戻す。
 */
export function PageNumberStamp({ kind }: { kind: string }) {
  useEffect(() => {
    // ── 画面プレビュー用: 各カード右上に書類種別を表示 ──────────────────
    const stampScreen = () => {
      document.querySelectorAll<HTMLElement>(".page").forEach((page) => {
        page.querySelectorAll(".page-number-stamp").forEach((el) => el.remove());
        if (getComputedStyle(page).position === "static") {
          page.style.position = "relative";
        }
        const badge = document.createElement("div");
        badge.className = "page-number-stamp";
        badge.textContent = `【${kind}】`;
        page.prepend(badge);
      });
    };

    // ── 印刷用: 物理シート数を計測してシートごとにスタンプを配置 ─────────
    // 注意: beforeprint の時点ではブラウザは画面用CSSのままレイアウトしているため、
    // そのまま測ると画面用のA4カード（min-height:297mm）の高さで枚数を過大計算してしまう。
    // 計測の間だけ body.print-measure を付与して印刷と同じコンパクトレイアウトを再現し、
    // その状態の高さから実際の印刷枚数を求める。
    const stampSheets = () => {
      removeSheetStamps();
      const pages = Array.from(document.querySelectorAll<HTMLElement>(".page"));
      if (pages.length === 0) return;

      // 1枚あたりの印字可能高さ（現在の @page 上下余白を反映）
      const topMm = readMarginMm("--print-margin-top", 7);
      const bottomMm = readMarginMm("--print-margin-bottom", 7);
      const usablePx = (PAGE_HEIGHT_MM - topMm - bottomMm) * PX_PER_MM;
      if (usablePx <= 0) return;

      // ── 計測モードで印刷レイアウトを再現して実測 ──
      document.body.classList.add("print-measure");
      // 強制リフロー（クラス適用後のレイアウトを確定させる）
      void document.body.offsetHeight;

      const firstRect = pages[0].getBoundingClientRect();
      const lastRect = pages[pages.length - 1].getBoundingClientRect();
      const docTop = firstRect.top + window.scrollY;
      const docBottom = lastRect.bottom + window.scrollY;
      // スタンプはbody基準の絶対配置。文書座標→body座標へ補正する
      const bodyDocTop = document.body.getBoundingClientRect().top + window.scrollY;

      document.body.classList.remove("print-measure");

      // 丸め誤差で1枚多く数えないよう、わずかな超過（4px≒1mm）は切り捨てる
      const contentHeight = docBottom - docTop;
      const total = Math.max(1, Math.ceil((contentHeight - 4) / usablePx));

      // フッター（ページ番号）の高さ相当。各シート下端にこの分だけ上げて配置する。
      const footerH = Math.round(4 * PX_PER_MM);

      for (let i = 0; i < total; i++) {
        const sheetTop = docTop + i * usablePx;
        // 内容の範囲を超える位置にスタンプを置かない
        // （範囲外に絶対配置すると、スタンプ自体が白紙ページを作ってしまうため）
        if (sheetTop >= docBottom - 4) break;
        // このシートの下端（次の改ページ位置。最終シートは文書末尾）。
        const sheetBottom = Math.min(docTop + (i + 1) * usablePx, docBottom);
        const stamp = document.createElement("div");
        stamp.className = "print-sheet-stamp";
        // 例: 1/2, 2/2（各ページ下部中央に必ず表示）
        stamp.textContent = `${i + 1}/${total}`;
        // ページ下端フッターとして配置（下端からフッター高さ分だけ上へ）。
        stamp.style.top = `${Math.round(sheetBottom - bodyDocTop - footerH)}px`;
        document.body.appendChild(stamp);
      }
    };

    const removeSheetStamps = () => {
      document.querySelectorAll(".print-sheet-stamp").forEach((el) => el.remove());
    };

    stampScreen();
    window.addEventListener("beforeprint", stampSheets);
    window.addEventListener("afterprint", removeSheetStamps);
    return () => {
      window.removeEventListener("beforeprint", stampSheets);
      window.removeEventListener("afterprint", removeSheetStamps);
    };
  }, [kind]);

  return null;
}

"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

const MIN_MARGIN_MM = 2;
const MAX_MARGIN_MM = 25;
/** 96dpi基準でのCSS上の mm→px 換算（1mm = 96/25.4 px） */
const PX_PER_MM = 96 / 25.4;

function clampMm(mm: number): number {
  return Math.max(MIN_MARGIN_MM, Math.min(MAX_MARGIN_MM, mm));
}

type HandleKind = "top" | "bottom" | "roleGap";

type DragState = { kind: HandleKind; startY: number; startMm: number };

interface ShinseiMarginControlsProps {
  /** 初期上余白（mm）。呼び出し元の @page margin-top の現状値と合わせること */
  initialTopMm?: number;
  /** 初期下余白（mm）。呼び出し元の @page margin-bottom の現状値と合わせること */
  initialBottomMm?: number;
  /** @page の左右マージン（固定・調整対象外）。呼び出し元の @page margin-left/right の現状値と合わせること */
  sideMm?: number;
}

export function ShinseiMarginControls({
  initialTopMm = 6,
  initialBottomMm = 6,
  sideMm = 8,
}: ShinseiMarginControlsProps = {}) {
  const [topMargin, setTopMargin] = useState(initialTopMm);
  const [bottomMargin, setBottomMargin] = useState(initialBottomMm);
  const [roleGapMargin, setRoleGapMargin] = useState(0);
  const [positions, setPositions] = useState<{ top: number; bottom: number; roleGaps: number[] }>({
    top: 0, bottom: 0, roleGaps: [],
  });
  const draggingRef = useRef<DragState | null>(null);

  const recomputePositions = useCallback(() => {
    const pageEls = Array.from(document.querySelectorAll(".page"));
    if (pageEls.length === 0) return;
    const firstRect = pageEls[0].getBoundingClientRect();
    const lastRect = pageEls[pageEls.length - 1].getBoundingClientRect();
    const roleBannerEls = Array.from(document.querySelectorAll(".role-banner"));
    setPositions({
      top: firstRect.top,
      bottom: lastRect.bottom,
      roleGaps: roleBannerEls.map((el) => el.getBoundingClientRect().top),
    });
  }, []);

  useEffect(() => {
    recomputePositions();
    const pageEls = document.querySelectorAll(".page");
    const ro = new ResizeObserver(() => recomputePositions());
    pageEls.forEach((el) => ro.observe(el));
    window.addEventListener("resize", recomputePositions);
    window.addEventListener("scroll", recomputePositions, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", recomputePositions);
      window.removeEventListener("scroll", recomputePositions, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMouseDown = useCallback((kind: HandleKind, startMm: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = { kind, startY: e.clientY, startMm };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const d = draggingRef.current;
      if (!d) return;
      const deltaMm = (moveEvent.clientY - d.startY) / PX_PER_MM;
      const next = clampMm(d.startMm + deltaMm);
      if (d.kind === "top") setTopMargin(next);
      else if (d.kind === "bottom") setBottomMargin(next);
      else setRoleGapMargin(next);
      requestAnimationFrame(recomputePositions);
    };

    const handleMouseUp = () => {
      draggingRef.current = null;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }, [recomputePositions]);

  const handleBarStyle = (topPx: number): CSSProperties => ({
    position: "fixed", left: 0, right: 0, top: `${topPx - 3}px`, height: "6px",
    cursor: "ns-resize", background: "transparent", zIndex: 60,
  });

  return (
    <>
      <style>{`
        @page{
          margin-top:${topMargin}mm;margin-bottom:${bottomMargin}mm;
          margin-left:${sideMm}mm;margin-right:${sideMm}mm;
        }
        @media screen{
          .page{margin-top:${topMargin}mm;margin-bottom:${bottomMargin}mm;}
        }
        .role-banner{margin-top:${roleGapMargin}mm;}
        .margin-drag-handle:hover{background:rgba(37,99,235,0.18)!important;}
      `}</style>

      <div
        className="no-print margin-drag-handle"
        style={handleBarStyle(positions.top)}
        onMouseDown={handleMouseDown("top", topMargin)}
        title={`上余白: ${topMargin.toFixed(1)}mm（ドラッグで調整）`}
      />
      <div
        className="no-print margin-drag-handle"
        style={handleBarStyle(positions.bottom)}
        onMouseDown={handleMouseDown("bottom", bottomMargin)}
        title={`下余白: ${bottomMargin.toFixed(1)}mm（ドラッグで調整）`}
      />
      {positions.roleGaps.map((topPx, i) => (
        <div
          key={i}
          className="no-print margin-drag-handle"
          style={handleBarStyle(topPx)}
          onMouseDown={handleMouseDown("roleGap", roleGapMargin)}
          title={`セクション境界の隙間: ${roleGapMargin.toFixed(1)}mm（ドラッグで調整）`}
        />
      ))}
    </>
  );
}

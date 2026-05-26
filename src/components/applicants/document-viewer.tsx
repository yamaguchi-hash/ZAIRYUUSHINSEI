"use client";

import { useState } from "react";
import { X, ZoomIn, ZoomOut, RotateCw, Download, FileText, ExternalLink } from "lucide-react";

const DOC_TYPE_LABELS: Record<string, string> = {
  passport_front: "パスポート（表紙）",
  passport_data_page: "パスポート（顔写真ページ）",
  residence_card_front: "在留カード（表面）",
  residence_card_back: "在留カード（裏面）",
};

interface DocumentViewerProps {
  url: string;
  fileName: string;
  documentType: string;
  onClose: () => void;
}

export function DocumentViewerModal({ url, fileName, documentType, onClose }: DocumentViewerProps) {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const isPdf = fileName.toLowerCase().endsWith(".pdf") || url.includes(".pdf");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <p className="text-sm font-semibold text-gray-900">{DOC_TYPE_LABELS[documentType] ?? documentType}</p>
            <p className="text-xs text-gray-400 truncate max-w-[300px]">{fileName}</p>
          </div>
          <div className="flex items-center gap-2">
            {!isPdf && (
              <>
                <button
                  onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}
                  className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
                  title="縮小"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-xs text-gray-500 w-12 text-center">{Math.round(scale * 100)}%</span>
                <button
                  onClick={() => setScale((s) => Math.min(3, s + 0.25))}
                  className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
                  title="拡大"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
                  title="回転"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
              </>
            )}
            <a
              href={url}
              download={fileName}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
              title="ダウンロード"
            >
              <Download className="w-4 h-4" />
            </a>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
              title="新しいタブで開く"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto flex items-center justify-center bg-gray-100 p-4">
          {isPdf ? (
            <iframe
              src={`${url}#toolbar=1&view=FitH`}
              className="w-full h-full min-h-[60vh] rounded-lg border"
              title={fileName}
            />
          ) : (
            <div
              className="overflow-auto flex items-center justify-center"
              style={{ maxHeight: "70vh" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={fileName}
                style={{
                  transform: `scale(${scale}) rotate(${rotation}deg)`,
                  transformOrigin: "center center",
                  transition: "transform 0.2s ease",
                  maxWidth: scale === 1 ? "100%" : "none",
                }}
                className="rounded shadow-lg"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Trigger button + viewer state
interface DocumentViewTriggerProps {
  url: string;
  fileName: string;
  documentType: string;
  children: React.ReactNode;
}

export function DocumentViewTrigger({ url, fileName, documentType, children }: DocumentViewTriggerProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div onClick={() => setOpen(true)} className="cursor-zoom-in">
        {children}
      </div>
      {open && (
        <DocumentViewerModal
          url={url}
          fileName={fileName}
          documentType={documentType}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

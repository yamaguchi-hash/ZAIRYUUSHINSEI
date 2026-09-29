import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
  serverExternalPackages: ["docx"],
  // 添付書類一括PDF（merge-pdf）が日本語書類名の描画に使うフォント資産を
  // サーバーレス関数バンドルへ確実に含める（fs.readFileSyncでの動的読み込みは
  // トレースが不安定なため明示指定する）。
  outputFileTracingIncludes: {
    "/api/applications/[id]/merge-pdf/route": ["./src/lib/fonts/*.woff"],
  },
};

export default nextConfig;

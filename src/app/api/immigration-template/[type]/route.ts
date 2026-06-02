import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { readFileSync } from "fs";
import { join } from "path";

// テンプレートの定義
const TEMPLATES: Record<string, { label: string; filename: string; file: string }> = {
  "kazoku-koushin": {
    label: "在留期間更新許可申請（家族滞在）",
    filename: "kazoku_koushin_template.xml",
    file: "kazoku-koushin.xml",
  },
  "epa-koushin": {
    label: "在留期間更新許可申請（特定活動・EPA）",
    filename: "epa_koushin_template.xml",
    file: "epa-koushin.xml",
  },
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  // 認証チェック
  const session = await auth();
  const tenantId = (session?.user as any)?.tenantId;
  if (!tenantId) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { type } = await params;
  const tmpl = TEMPLATES[type];
  if (!tmpl) {
    return NextResponse.json(
      { error: `テンプレートが見つかりません: ${type}` },
      { status: 404 }
    );
  }

  try {
    const filePath = join(process.cwd(), "public", "templates", tmpl.file);
    const content = readFileSync(filePath);

    return new Response(content, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(tmpl.filename)}`,
        "Content-Length": content.length.toString(),
      },
    });
  } catch (err: any) {
    console.error("[immigration-template]", err);
    return NextResponse.json(
      { error: "テンプレートファイルの読み込みに失敗しました" },
      { status: 500 }
    );
  }
}

// テンプレート一覧取得
export async function POST(_req: NextRequest) {
  const session = await auth();
  if (!(session?.user as any)?.tenantId) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  return NextResponse.json({
    templates: Object.entries(TEMPLATES).map(([key, val]) => ({
      key,
      label: val.label,
      downloadUrl: `/api/immigration-template/${key}`,
    })),
  });
}

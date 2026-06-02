import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { put } from "@vercel/blob";
import { db, applications } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";

// ─── 型定義 ─────────────────────────────────────────────────────────────────
interface RasensXmlEntry {
  id: string;
  filename: string;          // 元のRASENS形式ファイル名
  description: string;       // 説明（申請人名・年度等）
  url: string;               // Vercel Blob URL
  uploadedAt: string;        // ISO日時
  fileSize: number;
}

// ─── POST: RASENSのXMLをアップロード・保存 ────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const tenantId = (session?.user as any)?.tenantId;
  if (!tenantId) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });

  try {
    const fd = await req.formData();
    const file = fd.get("file") as File | null;
    const description = (fd.get("description") as string) || "";

    if (!file) return NextResponse.json({ error: "ファイルが選択されていません" }, { status: 400 });
    if (!file.name.toLowerCase().endsWith(".xml")) {
      return NextResponse.json({ error: "XMLファイル（.xml）を選択してください" }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "ファイルサイズは5MB以下にしてください" }, { status: 400 });
    }

    // 申請案件を取得
    const [app] = await db.select().from(applications)
      .where(and(eq(applications.id, id), eq(applications.tenantId, tenantId)))
      .limit(1);
    if (!app) return NextResponse.json({ error: "申請案件が見つかりません" }, { status: 404 });

    // Vercel Blob に保存
    const blobPath = `rasens-xml/${tenantId}/${id}/${Date.now()}_${file.name}`;
    const blob = await put(blobPath, file, {
      access: "public",
      contentType: "application/xml",
    });

    // draftData に XML エントリを追加
    const currentDraft = (app.draftData as Record<string, any>) ?? {};
    const existing: RasensXmlEntry[] = currentDraft._rasensXmls ?? [];
    const newEntry: RasensXmlEntry = {
      id: randomUUID(),
      filename: file.name,
      description,
      url: blob.url,
      uploadedAt: new Date().toISOString(),
      fileSize: file.size,
    };
    const updated = [newEntry, ...existing];

    await db.update(applications)
      .set({ draftData: { ...currentDraft, _rasensXmls: updated }, updatedAt: new Date() })
      .where(eq(applications.id, id));

    return NextResponse.json({ success: true, entry: newEntry });
  } catch (err: any) {
    console.error("[rasens-xml POST]", err);
    return NextResponse.json({ error: err.message ?? "保存に失敗しました" }, { status: 500 });
  }
}

// ─── GET: 保存済みXML一覧を取得 ───────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const tenantId = (session?.user as any)?.tenantId;
  if (!tenantId) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });

  const [app] = await db.select().from(applications)
    .where(and(eq(applications.id, id), eq(applications.tenantId, tenantId)))
    .limit(1);
  if (!app) return NextResponse.json({ error: "申請案件が見つかりません" }, { status: 404 });

  const draft = (app.draftData as Record<string, any>) ?? {};
  const entries: RasensXmlEntry[] = draft._rasensXmls ?? [];

  return NextResponse.json({ entries });
}

// ─── DELETE: 保存済みXMLを削除 ────────────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const tenantId = (session?.user as any)?.tenantId;
  if (!tenantId) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });

  const { entryId } = await req.json();

  const [app] = await db.select().from(applications)
    .where(and(eq(applications.id, id), eq(applications.tenantId, tenantId)))
    .limit(1);
  if (!app) return NextResponse.json({ error: "申請案件が見つかりません" }, { status: 404 });

  const draft = (app.draftData as Record<string, any>) ?? {};
  const existing: RasensXmlEntry[] = draft._rasensXmls ?? [];
  const updated = existing.filter((e) => e.id !== entryId);

  await db.update(applications)
    .set({ draftData: { ...draft, _rasensXmls: updated }, updatedAt: new Date() })
    .where(eq(applications.id, id));

  return NextResponse.json({ success: true });
}

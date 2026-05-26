import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { put } from "@vercel/blob";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const ALLOWED_TYPES = [
  "image/jpeg", "image/jpg", "image/pjpeg", // JPG variants
  "image/png", "image/webp", "image/heic", "image/heif",
  "application/pdf",
];
const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  webp: "image/webp", heic: "image/heic", heif: "image/heif",
  pdf: "application/pdf",
};
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) return NextResponse.json({ error: "ファイルが選択されていません" }, { status: 400 });

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    // file.type が空または未対応の場合は拡張子で補完
    const mimeType = (file.type && ALLOWED_TYPES.includes(file.type))
      ? file.type
      : (EXT_TO_MIME[ext] ?? "");

    if (!mimeType)
      return NextResponse.json({ error: "対応していないファイル形式です（JPG/PNG/WebP/HEIC/PDF）" }, { status: 400 });
    if (file.size > MAX_SIZE)
      return NextResponse.json({ error: "ファイルサイズは10MB以下にしてください" }, { status: 400 });

    const tenantId = (session.user as any).tenantId ?? "unknown";
    const uniqueExt = ext || "jpg";
    const uniqueName = `${randomUUID()}.${uniqueExt}`;

    // Vercel Blob が設定されている場合はクラウド保存
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blobPath = `uploads/${tenantId}/${uniqueName}`;
      const blob = await put(blobPath, file, { access: "public", contentType: mimeType });
      return NextResponse.json({ url: blob.url, fileName: file.name, fileSize: file.size, mimeType });
    }

    // ローカル開発フォールバック: public/uploads に保存
    const uploadDir = path.join(process.cwd(), "public", "uploads", tenantId);
    await mkdir(uploadDir, { recursive: true });
    const bytes = await file.arrayBuffer();
    await writeFile(path.join(uploadDir, uniqueName), Buffer.from(bytes));
    const fileUrl = `/uploads/${tenantId}/${uniqueName}`;
    return NextResponse.json({ url: fileUrl, fileName: file.name, fileSize: file.size, mimeType });

  } catch (err: any) {
    console.error("Upload error:", err);
    const msg = err?.message?.includes("BLOB")
      ? "Vercel Blobが設定されていません。Vercelダッシュボードから Storage > Blob を接続してください。"
      : "アップロードに失敗しました";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

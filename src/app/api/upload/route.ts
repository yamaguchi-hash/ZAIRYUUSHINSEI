import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { put } from "@vercel/blob";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { db, applicantDocuments } from "@/lib/db";

const ALLOWED_TYPES = [
  "image/jpeg", "image/jpg", "image/pjpeg",
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
    const documentType = formData.get("documentType") as string | null;

    if (!file) return NextResponse.json({ error: "ファイルが選択されていません" }, { status: 400 });

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const mimeType = (file.type && ALLOWED_TYPES.includes(file.type))
      ? file.type
      : (EXT_TO_MIME[ext] ?? "");

    if (!mimeType)
      return NextResponse.json({ error: "対応していないファイル形式です（JPG/PNG/WebP/HEIC/PDF）" }, { status: 400 });
    if (file.size > MAX_SIZE)
      return NextResponse.json({ error: "ファイルサイズは10MB以下にしてください" }, { status: 400 });

    const tenantId = (session.user as any).tenantId ?? "unknown";
    const bytes = await file.arrayBuffer();

    let fileUrl: string;

    // Vercel Blob が設定されている場合はクラウド保存
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const uniqueName = `${randomUUID()}.${ext || "jpg"}`;
      const blobPath = `uploads/${tenantId}/${uniqueName}`;
      const blob = await put(blobPath, file, { access: "public", contentType: mimeType });
      fileUrl = blob.url;
    } else if (process.env.NODE_ENV === "development") {
      // ローカル開発: public/uploads に保存
      const uniqueName = `${randomUUID()}.${ext || "jpg"}`;
      const uploadDir = path.join(process.cwd(), "public", "uploads", tenantId);
      await mkdir(uploadDir, { recursive: true });
      await writeFile(path.join(uploadDir, uniqueName), Buffer.from(bytes));
      fileUrl = `/uploads/${tenantId}/${uniqueName}`;
    } else {
      // 本番フォールバック: Base64データURLとして保存
      const base64 = Buffer.from(bytes).toString("base64");
      fileUrl = `data:${mimeType};base64,${base64}`;
    }

    // documentType が指定されていればDBに一時レコードを保存（applicantId は null）
    let docId: string | null = null;
    if (documentType) {
      const validTypes = ["passport_front", "passport_data_page", "residence_card_front", "residence_card_back", "residence_card"];
      if (validTypes.includes(documentType)) {
        const [doc] = await db.insert(applicantDocuments).values({
          tenantId,
          applicantId: null as any,
          documentType: documentType as any,
          fileUrl,
          fileName: file.name,
          fileSize: file.size,
          mimeType,
        }).returning({ id: applicantDocuments.id });
        docId = doc.id;
      }
    }

    return NextResponse.json({ url: fileUrl, fileName: file.name, fileSize: file.size, mimeType, docId });

  } catch (err: any) {
    console.error("Upload error:", err);
    return NextResponse.json({ error: `アップロードに失敗しました: ${err.message}` }, { status: 500 });
  }
}

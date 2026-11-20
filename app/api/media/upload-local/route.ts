import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { tryWriteAudit } from "@/modules/audit/audit";
import { checkStaff, requestMeta } from "@/modules/auth/session";
import { checkUpload, MEDIA_LIMITS, sniffMime, type MediaKind } from "@/modules/media/upload-policy";

/**
 * DEVELOPMENT ONLY: stores uploads in public/uploads so products can be tried before Cloudinary keys
 * exist. Returns 404 in production, where uploads go straight to Cloudinary (/api/media/sign).
 * The real file type is checked from its first bytes, not the name or the browser's claim.
 */
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return new NextResponse(null, { status: 404 });

  const guard = await checkStaff("media.upload");
  if (!guard.ok) return NextResponse.json({ error: "Forbidden" }, { status: guard.status });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const kind = form?.get("kind");
  if (!(file instanceof File) || (kind !== "image" && kind !== "video"))
    return NextResponse.json({ error: "Send one image or video file" }, { status: 400 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffMime(bytes.subarray(0, 16));
  const check = mime
    ? checkUpload({ kind: kind as MediaKind, mime, bytes: bytes.byteLength, filename: file.name })
    : { ok: false as const, error: "Unsupported file type" };
  if (!check.ok || !mime || !(MEDIA_LIMITS[kind].mimes as readonly string[]).includes(mime))
    return NextResponse.json({ error: check.ok ? "Unsupported file type" : check.error }, { status: 400 });

  const folder = kind === "image" ? "images" : "videos";
  const name = `${randomBytes(12).toString("hex")}.${EXT[mime] ?? "bin"}`;
  const dir = path.join(process.cwd(), "public", "uploads", folder);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), bytes);

  await tryWriteAudit({
    actor: { id: guard.ctx.user.id, email: guard.ctx.user.email },
    action: "media.upload_local",
    entity: "media",
    after: { kind, mime, bytes: bytes.byteLength },
    ...(await requestMeta()),
  });
  return NextResponse.json({ url: `/uploads/${folder}/${name}`, mime });
}

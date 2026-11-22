import { v2 as cloudinary } from "cloudinary";
import { NextResponse } from "next/server";
import { checkStaff, requestMeta } from "@/modules/auth/session";
import { tryWriteAudit } from "@/modules/audit/audit";
import { storageSettings } from "@/modules/integrations/store";
import { checkUpload, uploadRequestSchema } from "@/modules/media/upload-policy";

/**
 * Returns a short-lived signed Cloudinary upload for staff with `media.upload`.
 * The browser uploads directly to Cloudinary with these parameters.
 */
export async function POST(request: Request) {
  const guard = await checkStaff("media.upload");
  if (!guard.ok) return NextResponse.json({ error: "Forbidden" }, { status: guard.status });

  const c = (await storageSettings()).cloudinary;
  if (!c) return NextResponse.json({ error: "Media storage is not configured" }, { status: 503 });

  const parsed = uploadRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const check = checkUpload(parsed.data);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  const resourceType = parsed.data.kind === "model" ? "raw" : parsed.data.kind;
  const timestamp = Math.round(Date.now() / 1000);
  const params: Record<string, string | number> = {
    timestamp,
    folder: `store/${parsed.data.kind}s`,
    // Cloudinary strips metadata (EXIF) when it re-encodes on delivery (f_auto/q_auto).
    ...(parsed.data.kind === "image" ? { allowed_formats: "jpg,jpeg,png,webp,avif,gif" } : {}),
    ...(parsed.data.kind === "video" ? { allowed_formats: "mp4,webm,mov" } : {}),
  };
  const signature = cloudinary.utils.api_sign_request(params, c.apiSecret);

  const meta = await requestMeta();
  await tryWriteAudit({
    actor: { id: guard.ctx.user.id, email: guard.ctx.user.email },
    action: "media.sign_upload",
    entity: "media",
    after: { kind: parsed.data.kind, bytes: parsed.data.bytes, filename: parsed.data.filename },
    ...meta,
  });

  return NextResponse.json({
    uploadUrl: `https://api.cloudinary.com/v1_1/${c.cloudName}/${resourceType}/upload`,
    apiKey: c.apiKey,
    params,
    signature,
    maxBytes: parsed.data.bytes,
  });
}

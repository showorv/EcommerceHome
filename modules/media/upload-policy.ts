import { z } from "zod";

/**
 * Upload rules (NFR-SEC-15). The browser asks for a signed upload, then uploads straight
 * to object storage — files never pass through or get served by the app server.
 */
export const MEDIA_LIMITS = {
  image: { maxBytes: 10 * 1024 * 1024, mimes: ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"] },
  video: { maxBytes: 100 * 1024 * 1024, mimes: ["video/mp4", "video/webm", "video/quicktime"] },
  model: { maxBytes: 20 * 1024 * 1024, mimes: ["model/gltf-binary", "application/octet-stream"] },
} as const;

export type MediaKind = keyof typeof MEDIA_LIMITS;

export const uploadRequestSchema = z.object({
  kind: z.enum(["image", "video", "model"]),
  mime: z.string().min(3).max(100),
  bytes: z.number().int().positive(),
  filename: z.string().min(1).max(200),
});

export type UploadRequest = z.infer<typeof uploadRequestSchema>;

export function checkUpload(req: UploadRequest): { ok: true } | { ok: false; error: string } {
  const rule = MEDIA_LIMITS[req.kind];
  if (!(rule.mimes as readonly string[]).includes(req.mime)) return { ok: false, error: "File type not allowed" };
  if (req.bytes > rule.maxBytes) return { ok: false, error: `File too large (max ${rule.maxBytes / 1024 / 1024} MB)` };
  if (req.kind === "model" && !req.filename.toLowerCase().endsWith(".glb"))
    return { ok: false, error: "3D models must be .glb" };
  return { ok: true };
}

/**
 * Checks the first bytes of a file against known signatures ("magic bytes").
 * Used in the browser before upload and by the worker when processing.
 */
export function sniffMime(head: Uint8Array): string | null {
  const b = (i: number) => head[i];
  const ascii = (start: number, len: number) => String.fromCharCode(...head.slice(start, start + len));
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  if (b(0) === 0x89 && ascii(1, 3) === "PNG") return "image/png";
  if (ascii(0, 4) === "GIF8") return "image/gif";
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "image/webp";
  if (ascii(4, 4) === "ftyp") {
    const brand = ascii(8, 4);
    if (brand === "avif" || brand === "avis") return "image/avif";
    if (brand === "qt  ") return "video/quicktime";
    return "video/mp4";
  }
  if (b(0) === 0x1a && b(1) === 0x45 && b(2) === 0xdf && b(3) === 0xa3) return "video/webm";
  if (ascii(0, 4) === "glTF") return "model/gltf-binary";
  return null;
}

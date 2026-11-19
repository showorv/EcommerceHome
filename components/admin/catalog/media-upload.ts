"use client";

import { checkUpload, sniffMime } from "@/modules/media/upload-policy";

export type Uploaded = { url: string; width: number; height: number; kind: "image" | "video" };

/**
 * Uploads one file from the admin. Uses Cloudinary (signed direct upload) when it is configured;
 * in development without Cloudinary keys it falls back to /api/media/upload-local.
 * Checks the real file type from its first bytes before sending anything.
 */
export async function uploadMedia(file: File): Promise<Uploaded> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const mime = sniffMime(head);
  const kind = mime?.startsWith("image/") ? "image" : mime?.startsWith("video/") ? "video" : null;
  if (!mime || !kind) throw new Error(`${file.name}: only JPG, PNG, WebP, AVIF, GIF, MP4, WebM or MOV files`);
  const check = checkUpload({ kind, mime, bytes: file.size, filename: file.name });
  if (!check.ok) throw new Error(`${file.name}: ${check.error}`);

  const size = kind === "image" ? await imageSize(file) : await videoSize(file);

  const sign = await fetch("/api/media/sign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, mime, bytes: file.size, filename: file.name }),
  });

  if (sign.status === 503) {
    // Cloudinary not configured → development fallback.
    const body = new FormData();
    body.set("file", file);
    body.set("kind", kind);
    const res = await fetch("/api/media/upload-local", { method: "POST", body });
    const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !json.url) {
      throw new Error(
        res.status === 404
          ? "Media storage is not configured. Add the Cloudinary keys."
          : (json.error ?? "Upload failed"),
      );
    }
    return { url: json.url, kind, ...size };
  }

  const signed = (await sign.json().catch(() => ({}))) as {
    uploadUrl?: string;
    apiKey?: string;
    params?: Record<string, string | number>;
    signature?: string;
    error?: string;
  };
  if (!sign.ok || !signed.uploadUrl || !signed.params || !signed.signature || !signed.apiKey)
    throw new Error(signed.error ?? "Upload not allowed");

  const body = new FormData();
  body.set("file", file);
  body.set("api_key", signed.apiKey);
  body.set("signature", signed.signature);
  for (const [k, v] of Object.entries(signed.params)) body.set(k, String(v));
  const res = await fetch(signed.uploadUrl, { method: "POST", body });
  const json = (await res.json().catch(() => ({}))) as { secure_url?: string; width?: number; height?: number };
  if (!res.ok || !json.secure_url) throw new Error("Upload to Cloudinary failed");
  return { url: json.secure_url, kind, width: json.width ?? size.width, height: json.height ?? size.height };
}

async function imageSize(file: File): Promise<{ width: number; height: number }> {
  try {
    const bmp = await createImageBitmap(file);
    const size = { width: bmp.width, height: bmp.height };
    bmp.close();
    return size;
  } catch {
    return { width: 0, height: 0 };
  }
}

function videoSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    const done = (s: { width: number; height: number }) => {
      URL.revokeObjectURL(url);
      resolve(s);
    };
    v.preload = "metadata";
    v.onloadedmetadata = () => done({ width: v.videoWidth, height: v.videoHeight });
    v.onerror = () => done({ width: 0, height: 0 });
    v.src = url;
  });
}

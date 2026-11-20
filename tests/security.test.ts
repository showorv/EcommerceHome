import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt, maskSecret, randomToken, safeEqual, sha256 } from "@/lib/crypto";
import { adminCsp, storefrontCsp } from "@/lib/security-headers";
import { _scrubForTest as scrub } from "@/modules/audit/audit";
import { checkUpload, sniffMime } from "@/modules/media/upload-policy";

const KEY = randomBytes(32).toString("base64");

describe("AES-256-GCM secrets", () => {
  it("round-trips", () => {
    const enc = encrypt("sk_live_abc123", KEY);
    expect(enc).not.toContain("sk_live");
    expect(decrypt(enc, KEY)).toBe("sk_live_abc123");
  });

  it("uses a fresh IV each time", () => {
    expect(encrypt("same", KEY)).not.toBe(encrypt("same", KEY));
  });

  it("detects tampering and wrong keys", () => {
    const enc = encrypt("secret", KEY);
    const parts = enc.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decrypt(parts.join("."), KEY)).toThrow();
    expect(() => decrypt(enc, randomBytes(32).toString("base64"))).toThrow();
  });

  it("masks, hashes and compares", () => {
    expect(maskSecret("abcdefgh1234")).toBe("••••••••1234");
    expect(sha256("x")).toHaveLength(64);
    expect(randomToken().length).toBeGreaterThanOrEqual(43);
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
  });
});

describe("audit scrubbing", () => {
  it("never stores secrets", () => {
    const out = scrub({ email: "a@b.c", password: "p", nested: { apiKey: "k", ok: 1 }, list: [{ token: "t" }] });
    expect(out).toEqual({
      email: "a@b.c",
      password: "[redacted]",
      nested: { apiKey: "[redacted]", ok: 1 },
      list: [{ token: "[redacted]" }],
    });
  });
});

describe("Content-Security-Policy", () => {
  it("admin policy uses a nonce and strict-dynamic, no unsafe-inline scripts", () => {
    const csp = adminCsp("abc123", false);
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("storefront policy blocks framing, objects and foreign form targets", () => {
    const csp = storefrontCsp(false);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).not.toContain("unsafe-eval");
  });
});

describe("upload policy", () => {
  it("enforces type and size limits", () => {
    expect(checkUpload({ kind: "image", mime: "image/png", bytes: 1000, filename: "a.png" }).ok).toBe(true);
    expect(checkUpload({ kind: "image", mime: "image/svg+xml", bytes: 1000, filename: "a.svg" }).ok).toBe(false);
    expect(checkUpload({ kind: "image", mime: "image/png", bytes: 11 * 1024 * 1024, filename: "a.png" }).ok).toBe(
      false,
    );
    expect(checkUpload({ kind: "video", mime: "video/mp4", bytes: 99 * 1024 * 1024, filename: "a.mp4" }).ok).toBe(true);
    expect(checkUpload({ kind: "model", mime: "model/gltf-binary", bytes: 1000, filename: "a.exe" }).ok).toBe(false);
  });

  it("detects real file types from magic bytes", () => {
    expect(sniffMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe("image/png");
    expect(sniffMime(new TextEncoder().encode("RIFF\0\0\0\0WEBP"))).toBe("image/webp");
    expect(sniffMime(new TextEncoder().encode("\0\0\0\x20ftypisom"))).toBe("video/mp4");
    expect(sniffMime(new TextEncoder().encode("glTF"))).toBe("model/gltf-binary");
    expect(sniffMime(new TextEncoder().encode("<?php echo"))).toBeNull();
  });
});

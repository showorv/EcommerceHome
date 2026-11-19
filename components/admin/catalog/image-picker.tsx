"use client";

import { ImageIcon, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uploadMedia } from "./media-upload";

/** One image: upload a file or paste a link, with alt text and a preview. */
export function ImagePicker({
  id,
  value,
  onChange,
}: {
  id: string;
  value: { url: string; alt: string };
  onChange: (v: { url: string; alt: string }) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const up = await uploadMedia(file);
      if (up.kind !== "image") throw new Error("Pick an image file");
      onChange({ ...value, url: up.url });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex gap-3">
      <div className="bg-muted flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md border">
        {value.url ? (
          // eslint-disable-next-line @next/next/no-img-element -- admin preview of an arbitrary uploaded URL
          <img src={value.url} alt={value.alt} className="size-full object-cover" />
        ) : (
          <ImageIcon className="text-muted-foreground size-6" aria-hidden />
        )}
      </div>
      <div className="grid flex-1 gap-2">
        <div className="flex gap-2">
          <Input
            id={id}
            placeholder="Upload an image →"
            value={value.url}
            onChange={(e) => onChange({ ...value, url: e.target.value })}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <Button type="button" variant="outline" size="icon" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Upload className="size-4" aria-hidden />
            <span className="sr-only">Upload image</span>
          </Button>
          {value.url && (
            <Button type="button" variant="ghost" size="icon" onClick={() => onChange({ url: "", alt: "" })}>
              <X className="size-4" aria-hidden />
              <span className="sr-only">Remove image</span>
            </Button>
          )}
        </div>
        <Input
          aria-label="Image description (alt text)"
          placeholder="Describe the image (alt text)"
          value={value.alt}
          onChange={(e) => onChange({ ...value, alt: e.target.value })}
        />
      </div>
    </div>
  );
}

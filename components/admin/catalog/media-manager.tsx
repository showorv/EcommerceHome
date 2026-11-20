"use client";

import { ArrowDown, ArrowUp, Film, ImageIcon, Link2, Trash2, Upload, MonitorPlay } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { uploadMedia } from "./media-upload";

export type MediaDraft = {
  id: string; // existing _id, or "tmp-…" for new items
  type: "image" | "video" | "youtube" | "model";
  url: string;
  alt: string;
  poster: string;
  width: number;
  height: number;
  focalX: number;
  focalY: number;
  autoplayOnHover: boolean;
};

const tmpId = () => `tmp-${Math.random().toString(36).slice(2, 10)}`;

/**
 * Product media (step 1.3): drag-and-drop / multi-file upload, YouTube links, reorder,
 * alt text, focal point (click the preview) and which item shows on card hover.
 */
export function MediaManager({
  media,
  onChange,
  hoverIndex,
  onHoverIndex,
}: {
  media: MediaDraft[];
  onChange: (m: MediaDraft[]) => void;
  hoverIndex: number;
  onHoverIndex: (i: number) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [link, setLink] = useState("");

  async function addFiles(files: FileList | File[]) {
    const list = Array.from(files).slice(0, 30 - media.length);
    if (list.length === 0) return;
    setUploading((n) => n + list.length);
    const added: MediaDraft[] = [];
    for (const file of list) {
      try {
        const up = await uploadMedia(file);
        added.push({
          id: tmpId(),
          type: up.kind,
          url: up.url,
          alt: "",
          poster: "",
          width: up.width,
          height: up.height,
          focalX: 50,
          focalY: 50,
          autoplayOnHover: false,
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (added.length) onChange([...media, ...added]);
  }

  function addLink() {
    const url = link.trim();
    if (!url) return;
    if (!/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(url)) {
      toast.error("Only YouTube links can be added. Upload images and video files instead.");
      return;
    }
    onChange([
      ...media,
      {
        id: tmpId(),
        type: "youtube",
        url,
        alt: "",
        poster: "",
        width: 0,
        height: 0,
        focalX: 50,
        focalY: 50,
        autoplayOnHover: false,
      },
    ]);
    setLink("");
  }

  const update = (i: number, patch: Partial<MediaDraft>) =>
    onChange(media.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= media.length) return;
    const next = [...media];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
    if (hoverIndex === i) onHoverIndex(j);
    else if (hoverIndex === j) onHoverIndex(i);
  };
  const remove = (i: number) => {
    onChange(media.filter((_, j) => j !== i));
    if (hoverIndex >= media.length - 1) onHoverIndex(Math.max(0, media.length - 2));
  };

  return (
    <div className="grid gap-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "grid place-items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors",
          dragOver ? "border-primary bg-primary/5" : "border-border",
        )}
      >
        <Upload className="text-muted-foreground size-6" aria-hidden />
        <p className="text-sm">
          Drag images or videos here, or{" "}
          <button type="button" className="text-primary font-medium underline" onClick={() => fileRef.current?.click()}>
            choose files
          </button>
        </p>
        <p className="text-muted-foreground text-xs">
          JPG, PNG, WebP up to 10 MB · MP4/WebM up to 100 MB · first image is the main one
        </p>
        {uploading > 0 && (
          <p className="text-sm" role="status">
            Uploading {uploading}…
          </p>
        )}
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*,video/mp4,video/webm,video/quicktime"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <div className="flex gap-2">
        <Input
          aria-label="Add media by link"
          placeholder="Or paste a YouTube link"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addLink();
            }
          }}
        />
        <Button type="button" variant="outline" onClick={addLink}>
          <Link2 className="size-4" aria-hidden /> Add
        </Button>
      </div>

      {media.length > 0 && (
        <ol className="grid gap-3">
          {media.map((m, i) => (
            <li key={m.id} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row">
              <Preview m={m} onFocal={(focalX, focalY) => update(i, { focalX, focalY })} />
              <div className="grid min-w-0 flex-1 gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <TypeBadge type={m.type} />
                  {i === 0 && <Badge>Main</Badge>}
                  {i === hoverIndex && i !== 0 && <Badge variant="secondary">Shows on hover</Badge>}
                  <span className="text-muted-foreground truncate font-mono text-xs">{m.url}</span>
                </div>
                <Input
                  aria-label={`Alt text for item ${i + 1}`}
                  placeholder={m.type === "image" ? "Describe the image (alt text)" : "Short description"}
                  value={m.alt}
                  maxLength={200}
                  onChange={(e) => update(i, { alt: e.target.value })}
                />
                {m.type === "image" && (
                  <p className="text-muted-foreground text-xs">
                    Click the picture to set the focal point (kept in view when cropped): {Math.round(m.focalX)}% ×{" "}
                    {Math.round(m.focalY)}%
                  </p>
                )}
                {m.type === "video" && (
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={m.autoplayOnHover} onCheckedChange={(v) => update(i, { autoplayOnHover: v })} />
                    Play muted on hover in product cards
                  </label>
                )}
                <div className="flex flex-wrap gap-1">
                  <Button type="button" variant="ghost" size="sm" onClick={() => move(i, -1)} disabled={i === 0}>
                    <ArrowUp className="size-4" aria-hidden /> Up
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => move(i, 1)}
                    disabled={i === media.length - 1}
                  >
                    <ArrowDown className="size-4" aria-hidden /> Down
                  </Button>
                  {m.type === "image" && i !== 0 && i !== hoverIndex && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => onHoverIndex(i)}>
                      Use on hover
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => remove(i)}
                  >
                    <Trash2 className="size-4" aria-hidden /> Remove
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function TypeBadge({ type }: { type: MediaDraft["type"] }) {
  const Icon = type === "image" ? ImageIcon : type === "youtube" ? MonitorPlay : Film;
  return (
    <Badge variant="outline" className="gap-1 capitalize">
      <Icon className="size-3" aria-hidden /> {type}
    </Badge>
  );
}

function Preview({ m, onFocal }: { m: MediaDraft; onFocal: (x: number, y: number) => void }) {
  if (m.type === "image") {
    return (
      <button
        type="button"
        className="bg-muted relative size-28 shrink-0 cursor-crosshair overflow-hidden rounded-md"
        aria-label="Set focal point"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          onFocal(((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- admin preview */}
        <img src={m.url} alt="" className="size-full object-contain" />
        <span
          className="border-background bg-primary pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow"
          style={{ left: `${m.focalX}%`, top: `${m.focalY}%` }}
        />
      </button>
    );
  }
  if (m.type === "video") {
    return <video src={m.url} className="bg-muted size-28 shrink-0 rounded-md object-cover" muted preload="metadata" />;
  }
  return (
    <div className="bg-muted text-muted-foreground grid size-28 shrink-0 place-items-center rounded-md">
      <MonitorPlay className="size-8" aria-hidden />
    </div>
  );
}

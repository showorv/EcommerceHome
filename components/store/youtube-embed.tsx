"use client";

import { Play } from "lucide-react";
import { useState } from "react";

/** YouTube video that loads nothing from YouTube until the visitor presses play (privacy + speed). */
export function YouTubeEmbed({ id, title }: { id: string; title: string }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="relative aspect-video overflow-hidden rounded-lg bg-neutral-900">
      {playing ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          className="absolute inset-0 size-full"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="absolute inset-0 grid place-items-center text-white"
          aria-label={`Play video: ${title}`}
        >
          <span className="grid place-items-center gap-2 text-sm">
            <span className="grid size-16 place-items-center rounded-full bg-red-600 shadow-lg">
              <Play className="size-7 fill-white" aria-hidden />
            </span>
            Play video
          </span>
        </button>
      )}
    </div>
  );
}

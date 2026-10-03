import { useState } from "react";
import { faceUrl } from "@/Domain/faces/faceUrl";

const SIZE_CLASSES = {
  64: { box: "w-16 h-16", text: "text-2xl" },
  96: { box: "w-24 h-24", text: "text-4xl" },
} as const;

interface PlayerFaceProps {
  playerId: string;
  nationality?: string | null;
  clubColors?: readonly string[];
  /** Pixel size of the round avatar (64 dashboard card, 96 player screen). */
  size: keyof typeof SIZE_CLASSES;
  /** Shown until the face image loads (and if it fails). */
  fallback: string;
  className?: string;
}

/**
 * Round generated face of a player (`facesjs`, deterministic per id), rendered on the server
 * (`GET /api/faces/:playerId.svg`, cached as immutable) so facesjs never ships in a page bundle.
 * Decorative: the player's name is always next to it, so it is `aria-hidden` with an empty alt.
 */
export function PlayerFace({ playerId, nationality, clubColors, size, fallback, className = "" }: PlayerFaceProps) {
  const src = faceUrl(playerId, nationality, clubColors);
  // Status is tied to the URL it was reported for, so a new player starts as "loading"
  // without an effect (and a cached image's early onLoad is never overwritten).
  const [status, setStatus] = useState<{ src: string; value: "loaded" | "failed" } | null>(null);
  const state = status?.src === src ? status.value : "loading";
  const setState = (value: "loaded" | "failed") => setStatus({ src, value });

  return (
    <div
      aria-hidden="true"
      className={`relative ${SIZE_CLASSES[size].box} rounded-full border-2 border-primary/40 bg-muted/30 overflow-hidden flex items-center justify-center shrink-0 ${className}`}
    >
      {state !== "loaded" && (
        <span className={`${SIZE_CLASSES[size].text} font-black text-primary font-display`}>
          {fallback}
        </span>
      )}
      {state !== "failed" && (
        <img
          key={src}
          src={src}
          alt=""
          width={size}
          height={size}
          decoding="async"
          draggable={false}
          onLoad={() => setState("loaded")}
          onError={() => setState("failed")}
          className={`absolute inset-0 block w-full h-full ${state === "loaded" ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </div>
  );
}

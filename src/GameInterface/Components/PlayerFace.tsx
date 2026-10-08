import { useState } from "react";
import { faceUrl } from "@/Domain/faces/faceUrl";

const SIZE_CLASSES = {
  32: { box: "w-8 h-8", text: "font-display text-sm" },
  40: { box: "w-10 h-10", text: "font-display text-sm" },
  48: { box: "w-12 h-12", text: "font-display text-base" },
  64: { box: "w-16 h-16", text: "font-display text-2xl" },
  96: { box: "w-24 h-24", text: "font-display text-4xl" },
  128: { box: "w-32 h-32", text: "font-display text-5xl" },
} as const;

export type PlayerFaceSize = keyof typeof SIZE_CLASSES;

interface PlayerFaceProps {
  playerId: string;
  nationality?: string | null;
  clubColors?: readonly string[];
  /** Pixel size of the round avatar (32/40 lists, 48 formation pitch, 64 dashboard card, 96 player screen; 128 new-game avatar editor). */
  size: PlayerFaceSize;
  /** Shown until the face image loads (and if it fails). */
  fallback: string;
  /** Border classes of the circle (default: a soft primary ring). */
  ringClassName?: string;
  className?: string;
}

/** Up to two initials of a player's name ("Lucas Moura" → "LM"), used as the face fallback. */
export function playerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

/**
 * Round generated face of a player (`facesjs`, deterministic per id), rendered on the server
 * (`GET /api/faces/:playerId.svg`, cached as immutable) so facesjs never ships in a page bundle.
 * Decorative: the player's name is always next to it, so it is `aria-hidden` with an empty alt.
 */
export function PlayerFace({
  playerId, nationality, clubColors, ...rest
}: PlayerFaceProps) {
  return <FaceImage src={faceUrl(playerId, nationality, clubColors)} {...rest} />;
}

interface FaceImageProps {
  /** Server face URL (`faceUrl`, `personFaceUrl`, `managerFaceUrl`). */
  src: string;
  size: PlayerFaceSize;
  fallback: string;
  ringClassName?: string;
  className?: string;
}

/**
 * Round face image from a server SVG URL, with the initials until it loads (and if it fails).
 * Shared by players, coaching staff and managers (Etapa 31b). Decorative (`aria-hidden`).
 */
export function FaceImage({
  src, size, fallback, ringClassName = "border-2 border-primary/40", className = "",
}: FaceImageProps) {
  // Status is tied to the URL it was reported for, so a new face starts as "loading"
  // without an effect (and a cached image's early onLoad is never overwritten).
  const [status, setStatus] = useState<{ src: string; value: "loaded" | "failed" } | null>(null);
  const state = status?.src === src ? status.value : "loading";
  const setState = (value: "loaded" | "failed") => setStatus({ src, value });

  return (
    <div
      aria-hidden="true"
      className={`relative ${SIZE_CLASSES[size].box} rounded-full ${ringClassName} bg-muted/30 overflow-hidden flex items-center justify-center shrink-0 ${className}`}
    >
      {state !== "loaded" && (
        <span className={`${SIZE_CLASSES[size].text} font-black text-primary leading-none`}>
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
          loading="lazy"
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

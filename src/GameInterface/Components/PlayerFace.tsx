import { useEffect, useState } from "react";

type FaceModule = typeof import("@/GameInterface/Components/playerFaceSvg");

let facesModule: Promise<FaceModule> | null = null;
const loadFaces = () => (facesModule ??= import("@/GameInterface/Components/playerFaceSvg"));

/** Rendered SVG per player + colours, kept for the session (faces never change). */
const svgCache = new Map<string, string>();

const SIZE_CLASSES = {
  64: { box: "w-16 h-16", text: "text-2xl" },
  96: { box: "w-24 h-24", text: "text-4xl" },
} as const;

/** Square crop of the facesjs 400×600 portrait: hair to jersey collar. */
const CROP_VIEWBOX = 'viewBox="-80 40 560 560"';

interface PlayerFaceProps {
  playerId: string;
  nationality?: string | null;
  clubColors?: readonly string[];
  /** Pixel size of the round avatar (64 dashboard card, 96 player screen). */
  size: keyof typeof SIZE_CLASSES;
  /** Shown until the face is ready (and if facesjs fails to load). */
  fallback: string;
  className?: string;
}

/**
 * Round generated face of a player (`facesjs`, deterministic per id). Decorative: the player's
 * name is always next to it, so it is `aria-hidden`.
 */
export function PlayerFace({ playerId, nationality, clubColors, size, fallback, className = "" }: PlayerFaceProps) {
  const key = `${playerId}|${nationality ?? ""}|${(clubColors ?? []).join(",")}`;
  const [svg, setSvg] = useState<string | null>(() => svgCache.get(key) ?? null);

  useEffect(() => {
    const cached = svgCache.get(key);
    if (cached) {
      setSvg(cached);
      return;
    }
    setSvg(null);
    let cancelled = false;
    loadFaces()
      .then(({ playerFaceSvg }) => {
        const out = playerFaceSvg(playerId, nationality, clubColors)
          .replace(/viewBox="[^"]*"/, CROP_VIEWBOX)
          .replace(/preserveAspectRatio="[^"]*"/, 'preserveAspectRatio="xMidYMin slice"');
        svgCache.set(key, out);
        if (!cancelled) setSvg(out);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // `key` covers playerId, nationality and clubColors.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div
      aria-hidden="true"
      className={`${SIZE_CLASSES[size].box} rounded-full border-2 border-primary/40 bg-muted/30 overflow-hidden flex items-center justify-center shrink-0 ${className}`}
    >
      {svg ? (
        <span className="block w-full h-full [&>svg]:block [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <span className={`${SIZE_CLASSES[size].text} font-black text-primary font-display`}>
          {fallback}
        </span>
      )}
    </div>
  );
}

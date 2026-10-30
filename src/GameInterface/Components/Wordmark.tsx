import { gameArtUrl, newVisualOn } from "@/Domain/art/paintedFaces";
import { readNewVisual } from "@/GameInterface/artPrefs";

/** Only two sizes exist: `lg` on entry screens (centered, like the landing), `sm` in bars and side columns. */
const SIZE = { sm: "text-base", lg: "text-6xl sm:text-7xl" } as const;
/** Height of the art pack's logo (art phase 9) at each size: the letters line up with the text version. */
const ART_SIZE = { sm: "h-[22px]", lg: "h-[82px] sm:h-[98px]" } as const;

export function Wordmark({ size = "lg", className = "" }: { size?: keyof typeof SIZE; className?: string }) {
  // The entry pages run before the art manifest: the player's own switch decides there.
  if (newVisualOn() || (typeof window !== "undefined" && readNewVisual())) {
    return <img src={gameArtUrl("brand/wordmark.svg")} alt="FMPROJECT" className={`inline-block w-auto align-middle ${ART_SIZE[size]} ${className}`} />;
  }
  return (
    <span className={`font-wordmark font-bold tracking-wide leading-none text-foreground ${SIZE[size]} ${className}`}>
      FM<span className="text-primary">PROJECT</span>
    </span>
  );
}

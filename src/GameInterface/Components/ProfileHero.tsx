import { useState, type ReactNode } from "react";
import { gameArtUrl, newVisualOn } from "@/Domain/art/paintedFaces";

/**
 * Banner at the top of a profile page (club history and overview, manager page, retired player; 12.19): a painted
 * scene behind (only with the new visual and when the file loads), the picture on the left (crest, face), a small
 * label, the big name and a few lines. Without the painting the same layout on a plain card.
 * `attached` squares the bottom corners for a `StatStrip` right under it.
 */
export function ProfileHero({
  art, visual, eyebrow, title, lines = [], trailing, attached = false,
}: {
  /** Game art file (`GAME_ART_FILES`), e.g. `club/stadium-lv-3.webp`. */
  art?: string | null;
  visual?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
  lines?: ReactNode[];
  trailing?: ReactNode;
  attached?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const painted = !!art && newVisualOn() && !failed;
  const corners = attached ? "rounded-t-md" : "rounded-md";
  const shown = lines.filter((l) => l !== null && l !== undefined && l !== false && l !== "");
  return (
    <section
      className={`relative overflow-hidden border border-border bg-card ${corners} ${
        painted ? "min-h-60 phone:min-h-40 flex items-end" : "flex items-center"}`}
    >
      {painted && (
        <>
          <img
            src={gameArtUrl(art!)} alt="" aria-hidden draggable={false} onError={() => setFailed(true)}
            className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-card via-card/80 to-card/10" aria-hidden />
        </>
      )}
      <div className="relative flex flex-wrap items-center gap-x-6 gap-y-3 w-full px-6 py-5 phone:px-4 phone:py-3">
        {visual && <div className="shrink-0">{visual}</div>}
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          {eyebrow && <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{eyebrow}</span>}
          <p className="m-0 font-display font-black uppercase tracking-tight text-4xl phone:text-2xl leading-none text-foreground truncate">{title}</p>
          {shown.map((line, i) => (
            <p key={i} className={`m-0 text-sm text-muted-foreground min-w-0 ${i === 0 ? "mt-1.5" : ""}`}>{line}</p>
          ))}
        </div>
        {trailing && <div className="shrink-0 ml-auto">{trailing}</div>}
      </div>
    </section>
  );
}

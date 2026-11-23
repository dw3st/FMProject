import { gameArtUrl, newVisualOn } from "@/Domain/art/paintedFaces";
import { Icon } from "@/GameInterface/Icons";

export type TrophyKind = "league" | "cup" | "continental" | "national";

/** Painted trophy of each kind (`GAME_ART_FILES`); a national-team title uses the cup, tinted. */
const ART: Record<TrophyKind, string> = {
  league: "season/trophy-league.webp",
  cup: "season/trophy-cup.webp",
  continental: "season/trophy-continental.webp",
  national: "season/trophy-cup.webp",
};

/**
 * Crop of each painting so every trophy stands on the same base line with the same height (report 2026-11-19: the cup
 * painting fills less of its frame and stood shorter and wider). Image height = box / share of the frame the trophy
 * fills; top shift = 1 − bottom edge × that height. From the alpha bounding box of the 384 px paintings.
 */
const CROP: Record<TrophyKind, string> = {
  league: "h-[103%] top-[-1.4%]",
  cup: "h-[122%] top-[-20.3%]",
  continental: "h-[103%] top-[-1.4%]",
  national: "h-[122%] top-[-20.3%]",
};

/** The kind of a gallery title ("league:x", "cup:x", "continental:x"); anything else counts as a league title. */
export function trophyKindOf(title: string): TrophyKind {
  const kind = title.split(":")[0];
  return kind === "cup" || kind === "continental" || kind === "national" ? kind : "league";
}

export interface TrophyItem {
  key: string;
  kind: TrophyKind;
  count: number;
  label: string;
}

/**
 * Trophy room (12.19): one trophy per competition with the count and the name, a competition not won yet greyed out
 * with 0, and a shelf line under them. Painted trophies with the new visual, the trophy icon without it.
 */
export function TrophyShelf({ items }: { items: TrophyItem[] }) {
  const art = newVisualOn();
  return (
    <div className="rounded-md border border-border bg-card px-5 pt-5 pb-4 phone:px-3 phone:pt-3">
      <div className="flex flex-wrap items-start justify-around gap-x-4 gap-y-5">
        {items.map((it) => {
          const off = it.count === 0;
          return (
            <div key={it.key} className="w-28 phone:w-24 flex flex-col items-center text-center min-w-0" title={it.label}>
              <div className="relative h-24 phone:h-16 w-full flex items-end justify-center">
                {art ? (
                  <img
                    src={gameArtUrl(ART[it.kind])} alt="" aria-hidden draggable={false}
                    className={`absolute left-1/2 -translate-x-1/2 ${CROP[it.kind]} w-auto max-w-none select-none ${off ? "grayscale opacity-30" : ""} ${it.kind === "national" ? "hue-rotate-[160deg] saturate-50" : ""}`}
                  />
                ) : (
                  <Icon name="trophy" size={48} className={off ? "text-muted-foreground/40" : "text-star-gold"} />
                )}
              </div>
              <span className={`mt-1.5 font-display font-bold text-3xl leading-none tabular-nums ${off ? "text-muted-foreground" : "text-foreground"}`}>
                {it.count}
              </span>
              <span className="mt-1 font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground line-clamp-2">{it.label}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 h-2 rounded bg-secondary" aria-hidden />
    </div>
  );
}

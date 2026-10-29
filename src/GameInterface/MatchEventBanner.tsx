import { ClubLogo } from "@/GameInterface/Components/ClubLogo";

/** A moment shown in the broadcast-style strip at the bottom of the pitch (4.38.21). */
export interface MatchBannerItem {
  kind: "goal" | "yellow" | "red" | "sub";
  title: string;
  line: string;
  logoUrl?: string;
  /** Kit colours of the team, for the crest fallback. */
  colors?: [string, string];
  /** Changes on every new moment, so the strip animates in again. */
  key: number;
  /** A goal shown as the TV card (art phase 5): the scorer's face, the tag ("GOL · 23'"), the score after the goal. */
  goal?: { photo?: string; tag: string; score: string; color: string };
}

const ACCENT: Record<MatchBannerItem["kind"], string> = {
  goal: "bg-primary",
  yellow: "bg-chart-4",
  red: "bg-destructive",
  sub: "bg-chart-2",
};

/**
 * A goal as a TV lower third (art phase 5, from the art preview): bottom left, the team colour on the edge, the
 * scorer's face, the tag with the minute, the name, the crest and team, the score.
 */
function GoalTvCard({ item, goal }: { item: MatchBannerItem; goal: NonNullable<MatchBannerItem["goal"]> }) {
  return (
    <div
      key={item.key}
      role="status"
      className="absolute bottom-4 left-4 z-10 pointer-events-none flex items-stretch max-w-[92%] overflow-hidden rounded-lg bg-background/95 shadow-xl border-l-[6px] animate-[tvGoalIn_.45s_cubic-bezier(.2,.8,.2,1)] animate-tv-goal"
      style={{ borderLeftColor: goal.color }}
    >
      {goal.photo ? <img src={goal.photo} alt="" className="w-20 h-20 shrink-0 object-cover bg-secondary" /> : null}
      <div className="flex flex-col justify-center px-4 py-2 min-w-0">
        <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] tabular-nums" style={{ color: goal.color }}>{goal.tag}</span>
        <span className="font-display font-bold uppercase text-2xl leading-tight truncate">{item.title}</span>
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground min-w-0">
          <ClubLogo
            logoUrl={item.logoUrl}
            {...(item.colors ? { primaryColor: item.colors[0], secondaryColor: item.colors[1] } : {})}
            className="w-4 h-4 shrink-0"
            imgClassName="w-full h-full object-contain"
          />
          <span className="truncate">{item.line}</span>
        </span>
      </div>
      <div className="grid place-items-center px-4 bg-primary/15 font-display font-bold text-3xl tabular-nums">{goal.score}</div>
    </div>
  );
}

/** Lower third of the live pitch: crest (or the card), the moment in big letters and one line below. */
export function MatchEventBanner({ item }: { item: MatchBannerItem }) {
  if (item.kind === "goal" && item.goal) return <GoalTvCard item={item} goal={item.goal} />;
  return (
    <div
      key={item.key}
      role="status"
      className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 pointer-events-none flex items-stretch max-w-[92%] min-w-72 overflow-hidden rounded-md border border-border bg-card/95 shadow-lg animate-[bannerIn_.3s_ease-out]"
    >
      <div className={`w-1.5 shrink-0 ${ACCENT[item.kind]}`} aria-hidden="true" />
      <div className="flex items-center gap-3 px-3 py-2 min-w-0">
        {item.kind === "yellow" || item.kind === "red" ? (
          <span className={`w-4 h-6 rounded-sm shrink-0 ${item.kind === "yellow" ? "bg-chart-4" : "bg-destructive"}`} aria-hidden="true" />
        ) : (
          <ClubLogo
            logoUrl={item.logoUrl}
            {...(item.colors ? { primaryColor: item.colors[0], secondaryColor: item.colors[1] } : {})}
            className="w-8 h-8 shrink-0"
            imgClassName="w-full h-full object-contain"
          />
        )}
        <div className="min-w-0">
          <div className="font-display font-black uppercase text-xl leading-none truncate">{item.title}</div>
          <div className="text-sm text-muted-foreground truncate mt-1 tabular-nums">{item.line}</div>
        </div>
      </div>
    </div>
  );
}

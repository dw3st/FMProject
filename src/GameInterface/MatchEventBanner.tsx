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
}

const ACCENT: Record<MatchBannerItem["kind"], string> = {
  goal: "bg-primary",
  yellow: "bg-chart-4",
  red: "bg-destructive",
  sub: "bg-chart-2",
};

/** Lower third of the live pitch: crest (or the card), the moment in big letters and one line below. */
export function MatchEventBanner({ item }: { item: MatchBannerItem }) {
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

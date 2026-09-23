import { useTranslation } from "react-i18next";
import { DEFAULT_TEAM_KIT_HEX } from "@/GameInterface/matchTeamColors";

interface Props {
  kind: "halfTime" | "matchEnd" | null;
  score: { A: number; B: number };
  /** Resolved kit colours for overlays — same as pitch / placar */
  kitColorA?: string;
  kitColorB?: string;
}

export function MatchOverlay({ kind, score, kitColorA, kitColorB }: Props) {
  const { t } = useTranslation();
  if (!kind) return null;

  const a = kitColorA ?? DEFAULT_TEAM_KIT_HEX.A;
  const b = kitColorB ?? DEFAULT_TEAM_KIT_HEX.B;

  const title = kind === "halfTime" ? t("matchOverlay.halfTime") : t("matchOverlay.fullTime");
  const subtitle = kind === "halfTime" ? t("matchOverlay.secondHalfStarting") : t("matchOverlay.matchOver");

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
      <div className="absolute inset-0 bg-background/60 backdrop-blur-[3px]" />

      <div
        className="relative max-w-lg w-[min(100%,28rem)] mx-4 rounded-2xl overflow-hidden border border-border/60 bg-card/90 backdrop-blur-md shadow-2xl"
        style={{
          animation: "goal-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both",
          boxShadow: "0 24px 80px -20px rgba(0,0,0,0.45)",
        }}
      >
        {/* TeamCard-style side accents — solid strips, no blend */}
        <div className="absolute inset-y-0 left-0 w-[2px] z-10" style={{ backgroundColor: a }} aria-hidden />
        <div className="absolute inset-y-0 right-0 w-[2px] z-10" style={{ backgroundColor: b }} aria-hidden />

        {/* Split wash: two flat halves, hard edge (no gradient) */}
        <div className="absolute inset-0 flex pointer-events-none" aria-hidden>
          <div className="w-1/2 h-full" style={{ backgroundColor: `color-mix(in srgb, ${a} 12%, transparent)` }} />
          <div className="w-1/2 h-full" style={{ backgroundColor: `color-mix(in srgb, ${b} 12%, transparent)` }} />
        </div>

        <div className="relative flex flex-col items-center gap-3 px-10 py-10 sm:px-14 sm:py-11">
          <h2 className="text-4xl sm:text-5xl font-black tracking-widest leading-none font-display text-foreground uppercase m-0">
            {title}
          </h2>

          <div className="flex items-center gap-5 my-1">
            <span
              className="text-5xl font-black tabular-nums font-display"
              style={{
                color: a,
                textShadow: `0 0 24px ${a}55`,
              }}
            >
              {score.A}
            </span>
            <span className="text-3xl font-bold text-muted-foreground/40">–</span>
            <span
              className="text-5xl font-black tabular-nums font-display"
              style={{
                color: b,
                textShadow: `0 0 24px ${b}55`,
              }}
            >
              {score.B}
            </span>
          </div>

          <p className="text-xs sm:text-sm font-semibold tracking-widest text-muted-foreground uppercase m-0 text-center max-w-sm leading-relaxed">
            {subtitle}
          </p>
        </div>
      </div>
    </div>
  );
}

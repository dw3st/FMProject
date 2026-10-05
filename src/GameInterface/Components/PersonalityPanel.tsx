import { useTranslation } from "react-i18next";
import { bandLevel, personalityViewOf, summaryOf, traitBand, PERSONALITY_TRAITS } from "@/Domain/personality/personality";
import type { PersonalityView } from "@/types/personalityTypes";
import type { RosterPlayer } from "@/types/playerTypes";

/** One-word personality summary next to the player's name (`~` when the scout is unsure). */
export function PersonalitySummaryBadge({ view, className = "" }: { view: PersonalityView; className?: string }) {
  const { t } = useTranslation();
  const summary = summaryOf(view.traits);
  return (
    <span
      className={`text-sm font-semibold px-2 py-0.5 rounded border border-border text-muted-foreground normal-case font-sans tracking-normal ${className}`}
      title={t("personality.title")}
    >
      {view.uncertain ? "~" : ""}{t(`personality.summary.${summary}`)}
    </span>
  );
}

function SegmentBar({ level }: { level: number }) {
  return (
    <span className="inline-flex gap-1 shrink-0" aria-hidden>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`h-1.5 w-4 rounded ${i <= level ? "bg-primary" : "bg-border"}`} />
      ))}
    </span>
  );
}

/**
 * "Personality" block of the player screen (`.claude/rules/game/personality.md`): the four traits as
 * text bands with a 5-segment bar. Own player: exact; other clubs: the chief scout's view ("~", "?").
 */
export function PersonalityPanel({ player }: { player: RosterPlayer }) {
  const { t } = useTranslation();
  const view = personalityViewOf(player);
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display font-black uppercase text-xl leading-none m-0">{t("personality.title")}</h2>
        {view.uncertain && <span className="text-sm text-muted-foreground">{t("personality.scoutUncertain")}</span>}
      </div>
      <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2 max-w-3xl">
        {PERSONALITY_TRAITS.map((trait) => {
          const v = view.traits[trait];
          const band = v === null ? null : traitBand(v);
          return (
            <div key={trait} className="flex items-center justify-between gap-3 min-h-8">
              <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">
                {t(`personality.trait.${trait}`)}
              </span>
              <span className="flex items-center gap-3">
                <span className="text-sm text-foreground">
                  {band === null ? "?" : `${view.uncertain ? "~" : ""}${t(`personality.band.${trait}.${band}`)}`}
                </span>
                <SegmentBar level={band === null ? 0 : bandLevel(band)} />
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

import { useTranslation } from "react-i18next";
import { standingValueMult } from "@/Domain/standing/standing";
import type { PlayerStanding, RosterPlayer } from "@/types/playerTypes";

const BARS: (keyof PlayerStanding)[] = ["fans", "club", "world"];

/**
 * "Standing" block of the player screen (`.claude/rules/game/standing.md`): with the fans, at the club and in
 * the world, 0..10, recomputed every Monday, and what they do to his market value.
 */
export function StandingPanel({ player }: { player: Pick<RosterPlayer, "standing"> }) {
  const { t } = useTranslation();
  const s = player.standing;
  if (!s) return null;
  const pct = Math.round((standingValueMult(player) - 1) * 100);
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display font-black uppercase text-xl leading-none m-0">{t("standing.title")}</h2>
        <span className="text-sm text-muted-foreground tabular-nums">
          {pct === 0 ? t("standing.valueNeutral") : t("standing.value", { pct: `${pct > 0 ? "+" : ""}${pct}%` })}
        </span>
      </div>
      <div className="grid gap-x-8 gap-y-2 sm:grid-cols-3 max-w-3xl">
        {BARS.map((k) => (
          <div key={k} className="flex flex-col gap-1.5" title={t(`standing.hint.${k}`)}>
            <div className="flex items-center justify-between gap-3">
              <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{t(`standing.bar.${k}`)}</span>
              <span className="text-sm font-semibold tabular-nums text-foreground">{s[k]}/10</span>
            </div>
            <div className="h-1.5 rounded bg-border overflow-hidden" aria-hidden>
              <div className="h-full bg-primary" style={{ width: `${s[k] * 10}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

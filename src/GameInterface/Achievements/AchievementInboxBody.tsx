import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { MONEY_TRACKS, TIER_TEXT } from "@/GameInterface/Achievements/achievementsApi";
import { TIERS, TRACKS } from "@/Domain/achievements/catalog";
import { pointsOf } from "@/Domain/achievements/progress";
import { formatEuros } from "@/Domain/money";
import type { AchievementKey, TrackId } from "@/types/achievementTypes";

/** Body of an `achievement` inbox message: each unlock with its medal, name, points and what it asked for. */
export function AchievementInboxBody({ keys, points }: { keys: AchievementKey[]; points: number }) {
  const { t, i18n } = useTranslation();
  /** "Gols na carreira: 200" (tester report 180369a8: the message said only the points). */
  const goal = (id: TrackId, tier: string): string => {
    const desc = t(`achievements.tracks.${id}.desc`);
    const i = TIERS.indexOf(tier as (typeof TIERS)[number]);
    const def = TRACKS[id];
    if (!def || i < 0) return desc;
    if (i === 2 && def.goldRule) return t(`achievements.goldRules.${def.goldRule}`);
    const v = def.thresholds[i]!;
    const shown = def.kind === "rank" ? t("achievements.rankTop", { n: v }) : MONEY_TRACKS.has(id) ? formatEuros(v) : v.toLocaleString(i18n.language);
    return `${desc}: ${shown}`;
  };
  return (
    <div className="flex flex-col gap-3 text-sm">
      <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
        {keys.map((k) => {
          const secret = k.startsWith("secret:");
          const id = secret ? k.slice(7) : k.split(":")[0]!;
          const tier = (secret ? "secret" : k.split(":")[1]) as keyof typeof TIER_TEXT;
          return (
            <li key={k} className="flex flex-col gap-0.5 tabular-nums">
              <span className="flex items-center gap-2">
                <Icon name={secret ? "sparkles" : "medal"} size={16} className={TIER_TEXT[tier]} />
                <span className="font-semibold text-foreground">
                  {secret ? t(`achievements.secrets.${id}.name`) : t(`achievements.tracks.${id}.name`)}
                </span>
                <span className="text-muted-foreground">· {t(`achievements.tiers.${tier}`)} · +{pointsOf(k)}</span>
              </span>
              <span className="pl-6 text-muted-foreground">
                {secret ? t(`achievements.secrets.${id}.desc`) : goal(id as TrackId, tier)}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="m-0 text-muted-foreground tabular-nums">{t("achievements.inbox.preview", { points })}</p>
      <a href="/achievements" className="font-semibold text-primary hover:underline">{t("achievements.inbox.open")}</a>
    </div>
  );
}

import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { TIER_TEXT } from "@/GameInterface/Achievements/achievementsApi";
import { pointsOf } from "@/Domain/achievements/progress";
import type { AchievementKey } from "@/types/achievementTypes";

/** Body of an `achievement` inbox message: each unlock with its medal, name and points; link to the screen. */
export function AchievementInboxBody({ keys, points }: { keys: AchievementKey[]; points: number }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3 text-sm">
      <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
        {keys.map((k) => {
          const secret = k.startsWith("secret:");
          const id = secret ? k.slice(7) : k.split(":")[0]!;
          const tier = (secret ? "secret" : k.split(":")[1]) as keyof typeof TIER_TEXT;
          return (
            <li key={k} className="flex items-center gap-2 tabular-nums">
              <Icon name={secret ? "sparkles" : "medal"} size={16} className={TIER_TEXT[tier]} />
              <span className="font-semibold text-foreground">
                {secret ? t(`achievements.secrets.${id}.name`) : t(`achievements.tracks.${id}.name`)}
              </span>
              <span className="text-muted-foreground">· {t(`achievements.tiers.${tier}`)} · +{pointsOf(k)}</span>
            </li>
          );
        })}
      </ul>
      <p className="m-0 text-muted-foreground tabular-nums">{t("achievements.inbox.preview", { points })}</p>
      <a href="/achievements" className="font-semibold text-primary hover:underline">{t("achievements.inbox.open")}</a>
    </div>
  );
}

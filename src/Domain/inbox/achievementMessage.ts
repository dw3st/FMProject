import { pointsOf } from "@/Domain/achievements/progress";
import type { AchievementKey } from "@/types/achievementTypes";
import type { AchievementInboxMessage } from "@/types/inboxTypes";

/** Achievements unlocked today (`.claude/rules/game/achievements.md`). English fallback; the screen translates. */
export function buildAchievementMessage(date: string, keys: AchievementKey[]): AchievementInboxMessage {
  const points = keys.reduce((s, k) => s + pointsOf(k), 0);
  return {
    id: `achievement-${date}`,
    date,
    createdAt: date,
    read: false,
    category: "achievement",
    subject: keys.length === 1 ? "Achievement unlocked" : `${keys.length} achievements unlocked`,
    preview: `+${points} points`,
    kind: "unlocked",
    keys,
    points,
  };
}

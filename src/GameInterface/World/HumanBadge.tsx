import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";

/** Club run by another human of the friends' league: their nickname, in the "users" colour of the world icon. */
export function HumanBadge({ nickname }: { nickname: string }) {
  const { t } = useTranslation();
  return (
    <span
      className="inline-flex items-center gap-1 shrink-0 max-w-[140px] rounded border border-chart-2/40 bg-chart-2/10 px-2 py-0.5 text-sm font-semibold text-chart-2"
      title={t("leagues.humanManager", { nickname })}
    >
      <Icon name="users" size={16} className="shrink-0" />
      <span className="truncate">{nickname}</span>
    </span>
  );
}

import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { REACTION_ICON } from "@/GameInterface/World/reactionIcons";
import { scoreLineOf } from "@/Domain/rivals/results";
import type { ReactionId, TauntMeta } from "@/types/rivalsTypes";

/** A taunt in the chat: crest, "Vasco 0–3 Bahia", and the reaction icon or the phrase, in the reader's language. */
export function TauntLine({ taunt }: { taunt: TauntMeta }) {
  const { t } = useTranslation();
  return (
    <span className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5">
        <ClubLogo logoUrl={squadLogoUrl(taunt.clubId)} className="w-5 h-5 shrink-0" imgClassName="w-full h-full object-contain" />
        <span className="tabular-nums">{scoreLineOf(taunt)}</span>
        {taunt.live && <span className="text-muted-foreground tabular-nums">· {t("rivals.liveMinute", { minute: taunt.minute ?? 0 })}</span>}
      </span>
      {taunt.kind === "reaction" ? (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Icon name={REACTION_ICON[taunt.id as ReactionId]} size={16} />
          <span>{t(`rivals.reactions.${taunt.id}`)}</span>
        </span>
      ) : (
        <span className="italic">{t(`rivals.taunts.${taunt.id}`)}</span>
      )}
    </span>
  );
}

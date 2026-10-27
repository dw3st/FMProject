import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { Button } from "@/GameInterface/ui/Button";
import { useSocial } from "@/GameInterface/Social/useSocial";

/** The other manager opened the match room (multiplayer part 7): a card in the corner with "Join". */
export function H2HInvitePopup() {
  const { t } = useTranslation();
  const s = useSocial();
  if (!s.h2hPopup || !s.h2hInvite) return null;
  const name = s.h2hInvite.from;
  return (
    <div className="pointer-events-auto w-[300px] rounded-md border border-primary bg-card shadow-lg flex flex-col gap-2 p-3">
      <div className="flex items-start gap-2">
        <Icon name="play" size={16} className="shrink-0 text-primary mt-0.5" />
        <span className="flex-1 min-w-0 text-sm text-foreground break-words">{t("h2h.invite.popup", { name })}</span>
        <button
          type="button"
          onClick={s.dismissH2HPopup}
          aria-label={t("social.popup.dismiss")}
          className="shrink-0 bg-transparent border-0 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <Icon name="close" size={16} />
        </button>
      </div>
      <Button className="self-end" onClick={() => { window.location.href = "/match-room"; }}>
        {t("h2h.invite.join")}
      </Button>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { Button } from "@/GameInterface/ui/Button";
import { REACTION_ICON } from "@/GameInterface/World/reactionIcons";
import { rivalsApi } from "@/GameInterface/World/rivalsApi";
import type { WorldApiError } from "@/GameInterface/World/worldApi";
import { REACTIONS, tauntsFor } from "@/Domain/rivals/taunts";
import { RIVALS } from "@/Domain/rivals/rivalsConfig";
import type { TauntGroup, TauntKind, TauntTarget } from "@/types/rivalsTypes";

const ICON_BUTTON =
  "flex items-center justify-center w-8 h-8 rounded bg-transparent border-0 cursor-pointer text-muted-foreground hover:text-foreground disabled:opacity-50";

/** Reactions (icons) and ready phrases for a friend's result or live game. Sent to the league chat. */
export function TauntActions({ saveId, target, groups }: { saveId: string; target: TauntTarget; groups: readonly TauntGroup[] }) {
  const { t } = useTranslation();
  const [phrasesOpen, setPhrasesOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"sent" | WorldApiError | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phrases = tauntsFor(groups).slice(0, RIVALS.MENU_PHRASES);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function send(kind: TauntKind, id: string) {
    setBusy(true);
    const r = await rivalsApi.taunt(saveId, { target, kind, id });
    setBusy(false);
    setPhrasesOpen(false);
    setStatus(r.ok ? "sent" : r.error);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus(null), 2500);
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1" role="group" aria-label={t("rivals.actionsLabel")}>
        {REACTIONS.map((id) => (
          <button
            key={id}
            type="button"
            className={ICON_BUTTON}
            disabled={busy}
            onClick={() => void send("reaction", id)}
            aria-label={t(`rivals.reactions.${id}`)}
            title={t(`rivals.reactions.${id}`)}
          >
            <Icon name={REACTION_ICON[id]} size={16} />
          </button>
        ))}
        {phrases.length > 0 && (
          <Button
            variant="secondary"
            flush
            className="h-8 ml-1"
            disabled={busy}
            onClick={() => setPhrasesOpen((o) => !o)}
            aria-expanded={phrasesOpen}
          >
            {t("rivals.phrases")}
          </Button>
        )}
        {status && (
          <span className={`text-sm ml-1 ${status === "sent" ? "text-muted-foreground" : "text-destructive"}`}>
            {status === "sent" ? t("rivals.sent") : t(`world.errors.${status}`)}
          </span>
        )}
      </div>
      {phrasesOpen && (
        <ul className="m-0 p-0 list-none flex flex-col">
          {phrases.map((id) => (
            <li key={id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => void send("phrase", id)}
                className="w-full text-left text-sm text-foreground italic bg-transparent border-0 rounded px-2 py-1.5 cursor-pointer hover:bg-secondary/40"
              >
                {t(`rivals.taunts.${id}`)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

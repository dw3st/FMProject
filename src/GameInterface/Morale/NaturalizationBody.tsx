import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/GameInterface/ui/Button";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { PlayerNameText } from "@/GameInterface/Inbox/PlayerNameText";
import { nationalityDisplayName } from "@/Domain/world/labels";
import { formatGameDate } from "@/GameInterface/formatDate";
import type { PlayerInboxMessage } from "@/types/inboxTypes";

type State = "open" | "sending" | "supported" | "refused" | "closed" | "error";

/** Inbox body of a naturalization request (Apoiar / Não apoiar) or of the nationality granted. */
export function NaturalizationBody({ message }: { message: PlayerInboxMessage }) {
  const { t, i18n } = useTranslation();
  const { session, refresh } = useGameSave();
  const saveId = session?.saveId;
  const n = message.naturalization;
  const expires = n?.expires;
  const today = session?.currentDate;
  const [state, setState] = useState<State>(expires && today && today > expires ? "closed" : "open");
  if (!n) return null;
  const country = nationalityDisplayName(n.country, i18n.language, t);
  const players = [{ id: message.playerId, name: message.playerName }];
  if (message.kind === "naturalized") {
    return <p className="text-sm text-foreground m-0"><PlayerNameText text={t("naturalization.inbox.done", { player: message.playerName, country })} players={players} /></p>;
  }

  const answer = async (support: boolean) => {
    if (!saveId) return;
    setState("sending");
    try {
      const res = await fetch(`/api/saves/${saveId}/naturalization/${encodeURIComponent(message.playerId)}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ support }),
      });
      if (res.status === 404) { setState("closed"); return; }
      if (!res.ok) { setState("error"); return; }
      setState(support ? "supported" : "refused");
      void refresh();
    } catch {
      setState("error");
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground m-0">
        <PlayerNameText text={t("naturalization.inbox.ask", { player: message.playerName, country })} players={players} />
      </p>
      {expires && <p className="text-sm text-muted-foreground m-0">{t("naturalization.inbox.deadline", { date: formatGameDate(expires, i18n.language) })}</p>}
      {(state === "open" || state === "sending" || state === "error") && saveId && (
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => void answer(true)} disabled={state === "sending"}>{t("naturalization.inbox.support")}</Button>
          <Button variant="secondary" onClick={() => void answer(false)} disabled={state === "sending"}>{t("naturalization.inbox.refuse")}</Button>
        </div>
      )}
      {state === "error" && <p className="text-sm text-destructive m-0">{t("naturalization.inbox.error")}</p>}
      {state === "supported" && <p className="text-sm text-muted-foreground m-0">{t("naturalization.inbox.supported")}</p>}
      {state === "refused" && <p className="text-sm text-muted-foreground m-0">{t("naturalization.inbox.refused")}</p>}
      {state === "closed" && <p className="text-sm text-muted-foreground m-0">{t("naturalization.inbox.closed")}</p>}
    </div>
  );
}

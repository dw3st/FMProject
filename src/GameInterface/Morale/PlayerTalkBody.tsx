import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/GameInterface/ui/Button";
import { Icon } from "@/GameInterface/Icons";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { TalkModal } from "@/GameInterface/Morale/TalkModal";
import { useMorale } from "@/GameInterface/Morale/useMorale";
import type { PlayerInboxMessage } from "@/types/inboxTypes";

/**
 * Inbox body of a `player` message (`.claude/rules/game/morale.md`): the talk request with its
 * answers while it is still open, or the promise / transfer-request news.
 */
export function PlayerTalkBody({ message }: { message: PlayerInboxMessage }) {
  const { t } = useTranslation();
  const { session, refresh } = useGameSave();
  const saveId = session?.saveId;
  const { data, reload } = useMorale(message.kind === "talk" ? saveId : undefined);
  const [open, setOpen] = useState(false);
  const [answered, setAnswered] = useState(false);
  const vars = { player: message.playerName, club: message.clubName ?? "" };

  if (message.kind !== "talk") {
    const key = message.kind === "transfer_request"
      ? "morale.inbox.transfer_request"
      : `morale.inbox.${message.kind}.${message.promiseKind ?? "minutes"}`;
    return <p className="text-sm text-foreground m-0">{t(key, vars)}</p>;
  }

  const pending = !!data?.talks.some((x) => x.id === message.talkId) && !answered;
  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground m-0">{t(`morale.inbox.talk.${message.reason ?? "minutes"}`, vars)}</p>
      {pending && saveId ? (
        <Button onClick={() => setOpen(true)}>
          <Icon name="talk" size={16} />
          {t("morale.talk.answerRequest")}
        </Button>
      ) : data ? (
        <p className="text-sm text-muted-foreground m-0">{t("morale.inbox.closed")}</p>
      ) : null}
      {open && saveId && (
        <TalkModal
          saveId={saveId}
          player={{ id: message.playerId, name: message.playerName }}
          reason={message.reason ?? null}
          clubName={message.clubName}
          onClose={() => setOpen(false)}
          onDone={() => { setAnswered(true); reload(); void refresh(); }}
        />
      )}
    </div>
  );
}

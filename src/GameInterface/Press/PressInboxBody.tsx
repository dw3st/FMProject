import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/GameInterface/ui/Button";
import { Icon } from "@/GameInterface/Icons";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { formatGameDate } from "@/GameInterface/formatDate";
import { PressModal } from "@/GameInterface/Press/PressModal";
import { fetchPress, lastValidDay, type PressResponse } from "@/GameInterface/Press/pressApi";
import type { PressInboxMessage } from "@/types/inboxTypes";
import type { PressConferenceView } from "@/types/pressTypes";

/** Inbox body of a `press` invite: the text, how long it is valid and the Answer button while it is open. */
export function PressInboxBody({ message }: { message: PressInboxMessage }) {
  const { t, i18n } = useTranslation();
  const { session, refresh } = useGameSave();
  const saveId = session?.saveId;
  const [data, setData] = useState<PressResponse | null>(null);
  const [open, setOpen] = useState<PressConferenceView | null>(null);
  const [answered, setAnswered] = useState(false);

  const reload = useCallback(async () => {
    if (!saveId) return;
    try {
      setData(await fetchPress(saveId));
    } catch {
      setData({ pending: null, history: [] });
    }
  }, [saveId]);

  useEffect(() => { void reload(); }, [reload]);

  const trigger = t(`press.trigger.${message.trigger}`);
  const text = message.opponent
    ? t(`press.inbox.${message.pressKind}`, { trigger, opponent: message.opponent })
    : t("press.inbox.postNoOpponent", { trigger });
  const conference = data?.pending?.id === message.pressId && !answered ? data.pending : null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground m-0">{text}</p>
      {conference && saveId ? (
        <>
          <p className="text-sm text-muted-foreground m-0">
            {t("press.inbox.until", { date: formatGameDate(lastValidDay(message.expires), i18n.language, "dayMonth") })}
          </p>
          <Button onClick={() => setOpen(conference)}>
            <Icon name="mic" size={16} />
            {t("press.inbox.answer")}
          </Button>
        </>
      ) : data ? (
        <p className="text-sm text-muted-foreground m-0">{t("press.inbox.closed")}</p>
      ) : null}
      {open && saveId && (
        <PressModal
          saveId={saveId}
          conference={open}
          onClose={() => setOpen(null)}
          onDone={() => { setAnswered(true); void reload(); void refresh(); }}
        />
      )}
    </div>
  );
}

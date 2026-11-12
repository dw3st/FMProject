import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/GameInterface/ui/Button";
import { Icon } from "@/GameInterface/Icons";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { formatGameDate } from "@/GameInterface/formatDate";
import { PressModal } from "@/GameInterface/Press/PressModal";
import { fetchPress, sendDirectorToPress, type PressResponse } from "@/GameInterface/Press/pressApi";
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
  const [byDirector, setByDirector] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function sendDirector(pressId: string) {
    if (!saveId || busy) return;
    setBusy(true);
    setFailed(false);
    const ok = await sendDirectorToPress(saveId, pressId).catch(() => false);
    setBusy(false);
    if (!ok) { setFailed(true); return; }
    setByDirector(true);
    setAnswered(true);
    void reload();
    void refresh();
  }

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
            {t("press.inbox.until", { date: formatGameDate(message.expires, i18n.language, "dayMonth") })}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => setOpen(conference)} disabled={busy}>
              <Icon name="mic" size={16} />
              {t("press.inbox.answer")}
            </Button>
            <Button variant="secondary" onClick={() => void sendDirector(conference.id)} disabled={busy} title={t("press.inbox.directorHint")}>
              {t("press.inbox.sendDirector")}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground m-0">{t("press.inbox.directorHint")}</p>
          {failed && <p className="text-sm text-destructive m-0" role="alert">{t("press.error")}</p>}
        </>
      ) : byDirector ? (
        <p className="text-sm text-muted-foreground m-0" role="status">{t("press.inbox.directorSent")}</p>
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

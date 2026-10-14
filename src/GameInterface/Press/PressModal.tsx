import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DialogTitle } from "@headlessui/react";
import { Modal } from "@/GameInterface/Components/Modal";
import { Button } from "@/GameInterface/ui/Button";
import { allAnswered, answerPress } from "@/GameInterface/Press/pressApi";
import type { PressConferenceView } from "@/types/pressTypes";

interface Props {
  saveId: string;
  conference: PressConferenceView;
  onClose: () => void;
  /** After the server accepted the answers. */
  onDone: () => void;
}

/** Press conference (`.claude/rules/game/press.md`): one choice per question, no effect shown. */
export function PressModal({ saveId, conference, onClose, onDone }: Props) {
  const { t } = useTranslation();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = allAnswered(conference, answers);

  async function submit() {
    if (busy || !ready) return;
    setBusy(true);
    setError(null);
    try {
      const res = await answerPress(saveId, conference.id, answers);
      if ("error" in res) {
        setError(res.error === "pressClosed" ? t("press.closed") : t("press.error"));
        return;
      }
      setSent(true);
      onDone();
    } catch {
      setError(t("press.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} size="md">
      <div className="flex flex-col">
        <div className="px-6 py-4 border-b border-border bg-card/50">
          <DialogTitle as="h2" className="font-display font-black uppercase text-xl leading-none m-0">
            {t("press.modal.title", { trigger: t(`press.trigger.${conference.trigger}`) })}
          </DialogTitle>
        </div>
        <div className="p-6 space-y-6">
          {sent ? (
            <div className="space-y-4">
              <p className="text-sm text-foreground m-0" role="status">{t("press.sent")}</p>
              <Button onClick={onClose}>{t("common.close")}</Button>
            </div>
          ) : (
            <>
              {conference.questions.map((q, i) => (
                <fieldset key={q.id} className="space-y-2 border-0 p-0 m-0">
                  <legend className="block font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground p-0">
                    {t("press.question", { n: i + 1 })}
                  </legend>
                  <p className="text-sm text-foreground m-0">{t(q.key, { ...q.params })}</p>
                  <div className="grid gap-2">
                    {q.answers.map((a) => {
                      const selected = answers[q.id] === a.id;
                      return (
                        <button
                          key={a.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: a.id }))}
                          className={`text-left rounded-md border border-border bg-card p-3 text-sm text-foreground cursor-pointer ${
                            selected ? "border-primary ring-1 ring-primary" : "hover:border-primary/50"
                          }`}
                        >
                          {t(a.key, { ...q.params })}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
              {error && <p className="text-sm text-destructive m-0" role="alert">{error}</p>}
              <div className="flex gap-3 pt-2">
                <Button variant="secondary" className="flex-1" onClick={onClose}>{t("common.cancel")}</Button>
                <Button className="flex-1" onClick={submit} disabled={busy || !ready}>{t("press.send")}</Button>
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

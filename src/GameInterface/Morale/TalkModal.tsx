import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/GameInterface/Components/Modal";
import { Button } from "@/GameInterface/ui/Button";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { Label } from "@/GameInterface/ui/Label";
import { answersFor } from "@/Domain/morale/morale";
import { MORALE } from "@/Domain/morale/moraleConfig";
import type { TalkAnswer, TalkReason } from "@/types/moraleTypes";

const SALE_DAYS = [30, 60, 90] as const;

interface Props {
  saveId: string;
  /** Null = closed. */
  player: { id: string; name: string } | null;
  /** His open talk's reason; null = a free talk (praise / demand). */
  reason: TalkReason | null;
  /** wants_move: the club that bid. */
  clubName?: string;
  onClose: () => void;
  /** After the server answered; `openRenewal` = a renewal was promised (open the renewal). */
  onDone: (result: { change: number; noEffect?: boolean; openRenewal?: boolean }) => void;
}

/** Talk with a human-club player (`.claude/rules/game/morale.md`): the answers his reason allows. */
export function TalkModal({ saveId, player, reason, clubName, onClose, onDone }: Props) {
  const { t } = useTranslation();
  const answers = answersFor(reason);
  const [answer, setAnswer] = useState<TalkAnswer>(answers[0]!);
  const [minutes, setMinutes] = useState(3);
  const [days, setDays] = useState<number>(MORALE.SALE_PROMISE_DAYS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ change: number; noEffect?: boolean } | null>(null);

  useEffect(() => {
    setAnswer(answersFor(reason)[0]!);
    setResult(null);
    setError(null);
  }, [player?.id, reason]);

  if (!player) return null;

  async function submit() {
    if (busy || !player) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/saves/${saveId}/talks/${encodeURIComponent(player.id)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          answer,
          ...(answer === "promise_minutes" ? { minutes } : {}),
          ...(answer === "promise_sale" ? { days } : {}),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; change?: number; noEffect?: boolean; openRenewal?: boolean };
      if (!res.ok) {
        setError(t(`morale.talk.error.${body.error ?? "generic"}`, { defaultValue: t("morale.talk.error.generic") }));
        return;
      }
      const r = { change: body.change ?? 0, ...(body.noEffect ? { noEffect: true } : {}), ...(body.openRenewal ? { openRenewal: true } : {}) };
      setResult(r);
      onDone(r);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} size="sm">
      <div className="flex flex-col">
        <div className="px-6 py-4 border-b border-border bg-card/50">
          <h2 className="font-display font-black uppercase text-xl leading-none m-0">{t("morale.talk.title")}</h2>
          <p className="text-sm text-muted-foreground m-0 mt-1">
            {player.name} · {reason ? t(`morale.reason.${reason}`, { club: clubName ?? "" }) : t("morale.reason.none")}
          </p>
        </div>
        <div className="p-6 space-y-5">
          {result ? (
            <div className="space-y-4">
              <p className="text-sm text-foreground m-0">
                {result.noEffect
                  ? t("morale.talk.noEffect")
                  : t("morale.talk.done", { change: result.change > 0 ? `+${result.change}` : String(result.change) })}
              </p>
              <Button onClick={onClose}>{t("common.close")}</Button>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>{t("morale.talk.answer")}</Label>
                <OptionChips
                  aria-label={t("morale.talk.answer")}
                  options={answers.map((a) => ({ key: a, label: t(`morale.answer.${a}`) }))}
                  value={answer}
                  onChange={setAnswer}
                />
                <p className="text-sm text-muted-foreground m-0">{t(`morale.answerHint.${answer}`)}</p>
              </div>
              {answer === "promise_minutes" && (
                <div className="space-y-2">
                  <Label>{t("morale.talk.minutes")}</Label>
                  <OptionChips
                    aria-label={t("morale.talk.minutes")}
                    options={[1, 2, 3, 4, 5].map((n) => ({ key: String(n), label: t("morale.talk.ofFive", { n }) }))}
                    value={String(minutes)}
                    onChange={(k) => setMinutes(Number(k))}
                  />
                </div>
              )}
              {answer === "promise_sale" && (
                <div className="space-y-2">
                  <Label>{t("morale.talk.deadline")}</Label>
                  <OptionChips
                    aria-label={t("morale.talk.deadline")}
                    options={SALE_DAYS.map((d) => ({ key: String(d), label: t("morale.talk.days", { count: d }) }))}
                    value={String(days)}
                    onChange={(k) => setDays(Number(k))}
                  />
                </div>
              )}
              {error && <p className="text-sm text-destructive m-0" role="alert">{error}</p>}
              <div className="flex gap-3 pt-2">
                <Button variant="secondary" className="flex-1" onClick={onClose}>{t("common.cancel")}</Button>
                <Button className="flex-1" onClick={submit} disabled={busy}>{t("morale.talk.confirm")}</Button>
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

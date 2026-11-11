import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/GameInterface/Components/Modal";
import { Button } from "@/GameInterface/ui/Button";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { Label } from "@/GameInterface/ui/Label";
import { PlayerFace } from "@/GameInterface/Components/PlayerFace";
import { MoraleBadge } from "@/GameInterface/Components/MoraleBadge";
import { answersFor, moraleOf } from "@/Domain/morale/morale";
import { MORALE } from "@/Domain/morale/moraleConfig";
import { formatEuros } from "@/Domain/money";
import { newVisualOn, paintedNews } from "@/Domain/art/paintedFaces";
import type { TalkAnswer, TalkReason } from "@/types/moraleTypes";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { summaryTrait } from "@/Domain/personality/personality";

const SALE_DAYS = [30, 60, 90] as const;

/** How the answer usually moves his morale, for the card's colored line. */
const ANSWER_TONE: Record<TalkAnswer, "up" | "mid" | "down" | "risk"> = {
  promise_minutes: "up", promise_sale: "up", promise_renewal: "up", praise: "mid", demand: "mid", refuse: "down",
  confront: "risk", challenge: "up",
};
const TONE_CLASS = { up: "text-chart-2", mid: "text-chart-4", down: "text-destructive", risk: "text-chart-5" } as const;

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

/**
 * Talk with a human-club player (`.claude/rules/game/morale.md`): a painted scene of the talk's reason with his face and
 * morale over it, the answers his reason allows as cards (what each does, and how it tends to move his morale).
 * Tester report, option A of the mock of 2026-11-06. Without the art, the same header on a plain band.
 */
export function TalkModal({ saveId, player, reason, clubName, onClose, onDone }: Props) {
  const { t } = useTranslation();
  const { squad } = useGameSave();
  const answers = answersFor(reason);
  // Personality hint (`personality.md`): how he tends to take the talk (own player: exact).
  const own = player ? squad?.players.find((p) => p.id === player.id) : undefined;
  const summary = own ? summaryTrait(own) : "balanced";
  const [answer, setAnswer] = useState<TalkAnswer>(answers[0]!);
  const [minutes, setMinutes] = useState(3);
  const [days, setDays] = useState<number>(MORALE.SALE_PROMISE_DAYS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ change: number; noEffect?: boolean; broke?: boolean; bonus?: number } | null>(null);
  const [sceneFailed, setSceneFailed] = useState(false);

  useEffect(() => {
    setAnswer(answersFor(reason)[0]!);
    setResult(null);
    setError(null);
  }, [player?.id, reason]);

  if (!player) return null;
  const scene = newVisualOn() && !sceneFailed ? paintedNews(`talk-${reason ?? "none"}`) : null;
  const reasonText = reason ? t(`morale.reason.${reason}`, { club: clubName ?? "" }) : t("morale.reason.none");

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
      const body = (await res.json().catch(() => ({}))) as { error?: string; change?: number; noEffect?: boolean; openRenewal?: boolean; broke?: boolean; bonus?: number };
      if (!res.ok) {
        setError(t(`morale.talk.error.${body.error ?? "generic"}`, { defaultValue: t("morale.talk.error.generic") }));
        return;
      }
      const r = { change: body.change ?? 0, ...(body.noEffect ? { noEffect: true } : {}), ...(body.openRenewal ? { openRenewal: true } : {}), ...(body.broke ? { broke: true } : {}), ...(body.bonus !== undefined ? { bonus: body.bonus } : {}) };
      setResult(r);
      onDone(r);
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <div className="flex items-end gap-3">
      <PlayerFace playerId={player.id} nationality={own?.nationality} size={64} fallback={player.name.slice(0, 1)} />
      <div className="flex flex-col gap-1 min-w-0">
        <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">
          {t("morale.talk.title")} · {reasonText}
        </span>
        <span className="font-display font-black uppercase text-2xl leading-none truncate">{player.name}</span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {own && <MoraleBadge morale={moraleOf(own)} showValue />}
          {summary !== "balanced" && <span>{t(`personality.summary.${summary}`)}: {t(`personality.talkHint.${summary}`)}</span>}
        </span>
      </div>
    </div>
  );

  return (
    <Modal open onClose={onClose} size="lg">
      <div className="flex flex-col">
        {scene ? (
          <div className="relative">
            <img src={scene} alt="" onError={() => setSceneFailed(true)} className="block w-full max-w-full aspect-[720/300] object-cover" />
            <div className="absolute left-4 right-4 bottom-3.5 rounded-lg border border-border bg-background/85 px-3 py-2.5">{header}</div>
          </div>
        ) : (
          <div className="px-6 py-5 border-b border-border bg-card/50">{header}</div>
        )}
        <div className="px-6 pb-6 pt-4 space-y-5">
          {result ? (
            <div className="space-y-4">
              <p className="text-sm text-foreground m-0">
                {result.noEffect
                  ? t("morale.talk.noEffect")
                  : t("morale.talk.done", { change: result.change > 0 ? `+${result.change}` : String(result.change) })}
                {result.bonus !== undefined && !result.noEffect ? ` ${t("morale.talk.challengeSet", { bonus: formatEuros(result.bonus), matches: MORALE.CHALLENGE_MATCHES, rating: MORALE.CHALLENGE_RATING })}` : ""}
                {result.broke ? ` ${t("morale.talk.broke")}` : ""}
              </p>
              <Button onClick={onClose}>{t("common.close")}</Button>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>{t("morale.talk.answer")}</Label>
                <div role="radiogroup" aria-label={t("morale.talk.answer")} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {answers.map((a) => {
                    const on = a === answer;
                    const tone = ANSWER_TONE[a];
                    return (
                      <button
                        key={a}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => setAnswer(a)}
                        className={`flex flex-col items-start gap-1 rounded-md border p-3 text-left cursor-pointer transition-colors ${
                          on ? "border-primary ring-1 ring-primary bg-primary/10" : "border-border bg-card hover:border-primary/50"
                        }`}
                      >
                        <span className="font-display font-black uppercase text-base leading-none text-foreground">{t(`morale.answer.${a}`)}</span>
                        <span className="text-sm text-muted-foreground">{t(`morale.answerHint.${a}`)}</span>
                        <span className={`text-sm font-semibold ${TONE_CLASS[tone]}`}>{t(`morale.answerTone.${tone}`)}</span>
                      </button>
                    );
                  })}
                </div>
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
              <div className="flex justify-end gap-3 pt-1">
                <Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
                <Button onClick={submit} disabled={busy}>{t("morale.talk.confirm")}</Button>
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

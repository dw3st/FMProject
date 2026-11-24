import { useTranslation } from "react-i18next";
import type { AdviceTip } from "@/Domain/match/assistantAdvice";
import { Icon } from "@/GameInterface/Icons";

/** The assistant's tips during the live match (report 31dd5a2d): one line each, with the action and a dismiss. */
export function AssistantAdviceCard({ tips, onApply, onAct, onDismiss }: {
  tips: AdviceTip[];
  /** Does the planned change at once (report be8dd622): the substitution or the marking the assistant picked. */
  onApply: (tip: AdviceTip) => void;
  /** Opens the panel to choose by hand. */
  onAct: (tip: AdviceTip) => void;
  onDismiss: (id: string) => void;
}) {
  const { t } = useTranslation();
  if (tips.length === 0) return null;
  const text = (tip: AdviceTip) => {
    switch (tip.kind) {
      case "tired": return t("assistant.tip.tired", { name: tip.name, energy: tip.energy });
      case "booked": return t("assistant.tip.booked", { name: tip.name });
      case "attack": return t("assistant.tip.attack");
      case "protect": return t("assistant.tip.protect");
      case "mark": return t("assistant.tip.mark", { name: tip.name, shots: tip.shots, goals: tip.goals });
    }
  };
  /** The one-click change, when the assistant has one. */
  const planned = (tip: AdviceTip): string | null =>
    (tip.kind === "tired" || tip.kind === "booked") && tip.sub ? t("assistant.apply.sub", { name: tip.sub.inName })
      : tip.kind === "mark" && tip.marker ? t("assistant.apply.mark", { name: tip.marker.name })
        : null;
  const action = (tip: AdviceTip) =>
    tip.kind === "attack" ? t("assistant.action.attack")
      : tip.kind === "protect" ? t("assistant.action.protect")
        : tip.kind === "mark" ? t("assistant.action.mark")
          : t("assistant.action.sub");
  return (
    <div className="mt-2 rounded-md border border-chart-4/40 bg-chart-4/10 p-2 flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5 font-display font-bold uppercase tracking-[0.08em] text-[13px] text-chart-4">
        <Icon name="message-square" size={16} />{t("assistant.title")}
      </span>
      {tips.map((tip) => (
        <div key={tip.id} className="flex flex-col gap-1">
          <p className="text-sm text-foreground m-0 tabular-nums">{text(tip)}</p>
          <div className="flex flex-wrap items-center gap-2">
            {planned(tip) && (
              <button type="button" onClick={() => onApply(tip)}
                className="h-8 px-2 rounded-md border border-primary bg-primary/15 text-sm font-semibold text-primary hover:bg-primary/25">
                {planned(tip)}
              </button>
            )}
            <button type="button" onClick={() => onAct(tip)}
              className="h-8 px-2 rounded-md border border-border bg-card text-sm font-semibold text-foreground hover:border-primary">
              {planned(tip) ? t("assistant.choose") : action(tip)}
            </button>
            <button type="button" onClick={() => onDismiss(tip.id)} className="h-8 px-2 text-sm text-muted-foreground hover:text-foreground">
              {t("assistant.dismiss")}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

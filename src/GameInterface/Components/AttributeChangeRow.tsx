import { useTranslation } from "react-i18next";
import { ATTRIBUTE_LABELS, attrDisplay } from "@/Domain/attributes";
import type { AttributeId } from "@/Domain/attributes";
import { Icon } from "@/GameInterface/Icons";
import { attributeTextClass } from "@/GameInterface/scoreColors";

/** Translated attribute name; unknown ids fall back to the English label or the raw id. */
export function useAttributeName(): (stat: string) => string {
  const { t } = useTranslation();
  return (stat) =>
    t(`attributeNames.${stat}`, { defaultValue: ATTRIBUTE_LABELS[stat as AttributeId]?.label ?? stat });
}

/** One attribute change on the 0..100 display scale: "Velocidade 61 → 63". */
export function AttributeChangeRow({ stat, from, to }: { stat: string; from: number; to: number }) {
  const name = useAttributeName();
  const shownFrom = attrDisplay(from);
  const shownTo = attrDisplay(to);
  const up = to > from;
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{name(stat)}</span>
      <span className="flex items-center gap-1.5 tabular-nums font-bold">
        <span className="text-muted-foreground">{shownFrom}</span>
        <Icon
          name={up ? "trend-up" : "trend-down"}
          size={16}
          className={up ? "text-chart-2" : "text-destructive"}
        />
        <span className={attributeTextClass(shownTo)}>{shownTo}</span>
      </span>
    </div>
  );
}

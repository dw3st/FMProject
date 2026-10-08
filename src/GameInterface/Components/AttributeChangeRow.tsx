import { attrDisplay } from "@/Domain/attributes";
import { useAttributeText } from "@/GameInterface/attributeText";
import { Icon } from "@/GameInterface/Icons";
import { attributeTextClass } from "@/GameInterface/scoreColors";

/** Translated attribute name; unknown ids fall back to the English label or the raw id. */
export function useAttributeName(): (stat: string) => string {
  const text = useAttributeText();
  return (stat) => text(stat).name;
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

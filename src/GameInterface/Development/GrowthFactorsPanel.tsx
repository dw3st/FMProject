import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Icon } from "@/GameInterface/Icons";
import { factorPercent, type DevFactor, type DevelopmentFactors } from "@/Domain/development/developmentFactors";
import type { TrainingIntensity } from "@/types/developmentTypes";

/** "Treinador de goleiros 4★" and friends: the name of one factor. */
export function factorName(t: TFunction, f: DevFactor | { id: "age" }, intensity: TrainingIntensity): string {
  const k = "developmentScreen.factors";
  switch (f.id) {
    case "age": return t(`${k}.mainAge`);
    case "assistant":
      return f.stars == null ? t(`${k}.assistantVacant`) : t(`${k}.assistant`, { stars: starsText(f.stars) });
    case "area": {
      const area = t(`staff.area.${f.area}`);
      return f.stars == null ? t(`${k}.areaVacant`, { area }) : t(`${k}.area`, { area, stars: starsText(f.stars) });
    }
    case "intensity": {
      const key = intensity === "light" ? "Light" : intensity === "heavy" ? "Heavy" : "Normal";
      return t(`${k}.intensity`, { name: t(`development.intensity${key}`) });
    }
    default: return t(`${k}.${f.id}`);
  }
}

function starsText(stars: number): string {
  return Number.isInteger(stars) ? String(stars) : stars.toFixed(1);
}

/** "+8%", "−10%", "sem ganho" (a factor at 0) or "sem efeito". */
export function factorValue(t: TFunction, mult: number): string {
  if (mult === 0) return t("developmentScreen.factors.noGain");
  const pct = factorPercent(mult);
  if (pct === 0) return t("developmentScreen.factors.noEffect");
  return `${pct > 0 ? "+" : "−"}${Math.abs(pct)}%`;
}

/** Good for the player? Less decline is good, so a decline factor below 1 is green. */
function toneOf(f: DevFactor): string {
  const pct = factorPercent(f.mult);
  if (f.mult !== 0 && pct === 0) return "text-muted-foreground";
  const good = f.scope === "decay" ? f.mult < 1 : f.mult > 1;
  return good ? "text-chart-2" : "text-destructive";
}

export function GrowthFactorsPanel({ factors, age, intensity }: {
  factors: DevelopmentFactors;
  age: number;
  intensity: TrainingIntensity;
}) {
  const { t } = useTranslation();
  const k = "developmentScreen.factors";
  const ageLine = factors.phase === "growing"
    ? t(`${k}.ageGrowing`, { age, pct: Math.round(factors.ageGrowthShare * 100) })
    : factors.phase === "peak" ? t(`${k}.agePeak`, { age }) : t(`${k}.ageDeclining`, { age });
  const ageTone = factors.phase === "growing" ? "text-chart-2" : factors.phase === "peak" ? "text-chart-4" : "text-destructive";

  return (
    <div className="card-arcade rounded-md p-5">
      <div className="flex items-center gap-2 mb-1">
        <Icon name="zap" className="w-5 h-5 text-primary" />
        <h3 className="font-display font-black uppercase text-xl leading-none m-0">{t(`${k}.title`)}</h3>
      </div>
      <p className="text-sm text-muted-foreground m-0 mb-4">{t(`${k}.hint`)}</p>

      <p className={`text-sm font-semibold m-0 mb-3 ${ageTone}`}>{ageLine}</p>

      <ul className="m-0 p-0 list-none divide-y divide-border/50">
        {factors.factors.map((f, i) => (
          <li key={`${f.id}-${f.area ?? i}`} className="flex items-center gap-3 py-2">
            <div className="flex-1 min-w-0">
              <span className="block text-sm text-foreground break-words">{factorName(t, f, intensity)}</span>
              <span className="block font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">
                {t(`${k}.scope.${f.scope}`)}
              </span>
            </div>
            <span className={`text-sm font-bold tabular-nums text-right shrink-0 whitespace-nowrap ${toneOf(f)}`}>
              {factorValue(t, f.mult)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

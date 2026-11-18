import { useTranslation } from "react-i18next";
import type { ComponentId, MaterialId } from "@/types/craftTypes";

/** Placeholder tone per material / component (theme tokens only) until the painted icons (Task 14). */
const TONE: Record<MaterialId | ComponentId, string> = {
  concrete: "bg-muted-foreground/25 text-foreground",
  steel: "bg-chart-1/25 text-chart-1",
  wood: "bg-chart-4/25 text-chart-4",
  grass: "bg-primary/25 text-primary",
  fabric: "bg-chart-5/25 text-chart-5",
  electronics: "bg-chart-2/25 text-chart-2",
  beam: "bg-chart-1/25 text-chart-1",
  slab: "bg-muted-foreground/25 text-foreground",
  turfPanel: "bg-primary/25 text-primary",
  seat: "bg-chart-5/25 text-chart-5",
  floodlight: "bg-chart-4/25 text-chart-4",
  gymKit: "bg-chart-2/25 text-chart-2",
  medKit: "bg-destructive/25 text-destructive",
  furniture: "bg-chart-3/25 text-chart-3",
};

/**
 * Icon of a material or component. For now a coloured square with the initial; the painted icons
 * (craft plan, Task 14) replace the inside of this one component.
 */
export function CraftIcon({ kind, id, size = 24 }: { kind: "material" | "component"; id: MaterialId | ComponentId; size?: number }) {
  const { t } = useTranslation();
  const name = t(`craft.${kind}.${id}`);
  return (
    <span
      aria-hidden
      className={`inline-flex items-center justify-center rounded shrink-0 font-display font-bold text-sm leading-none ${TONE[id]}`}
      style={{ width: size, height: size }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

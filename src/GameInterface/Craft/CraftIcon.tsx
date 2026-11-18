import { useState } from "react";
import { useTranslation } from "react-i18next";
import { gameArtUrl, newVisualOn } from "@/Domain/art/paintedFaces";
import type { ComponentId, MaterialId } from "@/types/craftTypes";

/** Tone of the drawn fallback per material / component (theme tokens only): old visual or the painted icon missing. */
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
 * Icon of a material or component: the painted icon (`craft/<id>.webp`, `GAME_ART_FILES`) with the new visual, else
 * (or when the file fails to load) a coloured square with the initial.
 */
export function CraftIcon({ kind, id, size = 24 }: { kind: "material" | "component"; id: MaterialId | ComponentId; size?: number }) {
  const { t } = useTranslation();
  const name = t(`craft.${kind}.${id}`);
  const [failed, setFailed] = useState(false);
  if (newVisualOn() && !failed) {
    return (
      <img
        src={gameArtUrl(`craft/${id}.webp`)} alt="" aria-hidden draggable={false} onError={() => setFailed(true)}
        className="inline-block shrink-0 object-contain select-none" style={{ width: size, height: size }}
      />
    );
  }
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

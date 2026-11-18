import { useState, type ReactNode } from "react";
import { gameArtUrl, newVisualOn } from "@/Domain/art/paintedFaces";

/**
 * Painted banner at the top of a craft tab (`craft/workshop-lv-<n>.webp`, `craft/shop-banner.webp`): the content sits
 * over the bottom of the painting. Without the new visual (or when the file fails to load) only the content.
 */
export function CraftBanner({ art, children }: { art: string; children: ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (!newVisualOn() || failed) return <>{children}</>;
  return (
    <section className="relative overflow-hidden rounded-md border border-border bg-card min-h-40 phone:min-h-28 flex items-end">
      <img
        src={gameArtUrl(art)} alt="" aria-hidden draggable={false} onError={() => setFailed(true)}
        className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-card via-card/60 to-transparent" aria-hidden />
      <div className="relative w-full px-5 py-4 phone:px-3 phone:py-2">{children}</div>
    </section>
  );
}

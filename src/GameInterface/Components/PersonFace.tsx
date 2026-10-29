import { gameArtUrl, newVisualOn } from "@/Domain/art/paintedFaces";
import { FaceImage, playerInitials, type PlayerFaceSize } from "@/GameInterface/Components/PlayerFace";
import { managerFaceUrl, personFaceUrl } from "@/Domain/faces/faceUrl";
import type { ManagerFace } from "@/Domain/faces/managerFace";

/**
 * Face of a coaching-staff member (Etapa 31b): drawn on the server from the id, nationality and
 * age (`GET /api/faces/person/:id.svg`), shirt in the club colours (none = neutral, free pool).
 */
export function StaffFace({
  member, clubColors, size, className, ringClassName,
}: {
  ringClassName?: string;
  member: { id: string; name: string; nationality?: string | null; age?: number | null };
  clubColors?: readonly string[];
  size: PlayerFaceSize;
  className?: string;
}) {
  return (
    <FaceImage
      src={personFaceUrl(member.id, member.nationality, clubColors, member.age)}
      size={size}
      fallback={playerInitials(member.name)}
      className={className}
      ringClassName={ringClassName}
    />
  );
}

/** Face of a manager: the human one's saved avatar, otherwise the face drawn from the id. */
export function ManagerFaceImage({
  manager, clubColors, size, className, ringClassName, frame,
}: {
  ringClassName?: string;
  /** Achievements frame (art phase 7): with the new visual, the painted ring around the face. */
  frame?: "none" | "bronze" | "silver" | "gold" | "legend";
  manager: { id: string; name: string; face?: ManagerFace | null; nationality?: string | null };
  clubColors?: readonly string[] | null;
  size: PlayerFaceSize;
  className?: string;
}) {
  const face = (
    <FaceImage
      src={managerFaceUrl(manager, clubColors ?? undefined)}
      size={size}
      fallback={playerInitials(manager.name)}
      className={frame && frame !== "none" && newVisualOn() ? "" : className}
      ringClassName={frame && frame !== "none" && newVisualOn() ? "border-0" : ringClassName}
    />
  );
  if (!frame || frame === "none" || !newVisualOn()) return face;
  // The ring's clear centre is 104 of its 128 px: drawn 23% larger than the face, centred on it.
  return (
    <span className={`relative inline-flex shrink-0 ${className ?? ""}`}>
      {face}
      <img src={gameArtUrl(`frames/frame-${frame}.svg`)} alt="" aria-hidden="true" className="pointer-events-none absolute -inset-[11.5%] w-[123%] h-[123%] max-w-none" />
    </span>
  );
}

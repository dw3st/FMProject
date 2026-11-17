import type { ReactNode } from "react";
import { gameArtUrl, newVisualOn } from "@/Domain/art/paintedFaces";
import { ratingTextClass10 } from "@/GameInterface/scoreColors";
import { FaceImage, playerInitials } from "@/GameInterface/Components/PlayerFace";

/** Painted board of the vertical formation pitch (attack up). */
export const PITCH_BOARD = "formation/pitch-board.webp";

/** Height of the mini pitch, the same on every tab of the substitutions panel. */
export const PANEL_PITCH_HEIGHT = "h-[min(44rem,calc(100vh-17rem))]";

export function energyBarClass(energy: number): string {
  if (energy >= 60) return "bg-chart-2";
  if (energy >= 35) return "bg-chart-4";
  return "bg-destructive";
}

/** Pitch lines of the vertical formation pitch (attack up), over the painted board or a plain grass. */
export function PitchLinesVertical({ grass }: { grass: boolean }) {
  const line = { fill: "none", stroke: "rgba(255,255,255,0.22)", strokeWidth: 0.3 } as const;
  return (
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      {grass && <rect x="0" y="0" width="100" height="100" className="fill-chart-2/25" />}
      <rect x="5" y="5" width="90" height="90" {...line} />
      <line x1="5" y1="50" x2="95" y2="50" {...line} />
      <circle cx="50" cy="50" r="12" {...line} />
      <rect x="25" y="5" width="50" height="18" {...line} />
      <rect x="35" y="5" width="30" height="8" {...line} />
      <rect x="25" y="77" width="50" height="18" {...line} />
      <rect x="35" y="87" width="30" height="8" {...line} />
    </svg>
  );
}

/**
 * The mini pitch of every tab of the substitutions panel: the same board, the same height, and one line under it
 * (how many play out of position). Markers go in `children`, placed in % of the board.
 */
export function PanelPitch({ children, note, noteWarn }: { children: ReactNode; note?: ReactNode; noteWarn?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 min-w-0 max-w-full">
      <div className={`relative ${PANEL_PITCH_HEIGHT} max-w-full aspect-[3/4] rounded-md border border-chart-2/50 [container-type:inline-size]`}>
        <div className="absolute inset-0 rounded-md overflow-hidden">
          {newVisualOn() && <img src={gameArtUrl(PITCH_BOARD)} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover" />}
          <PitchLinesVertical grass={!newVisualOn()} />
        </div>
        {children}
      </div>
      {note !== undefined && (
        <p className={`text-sm m-0 ${noteWarn ? "text-chart-4" : "text-muted-foreground"}`}>{note}</p>
      )}
    </div>
  );
}

/**
 * One player on the panel's mini pitch, the same on every tab: face with the slot's role (top left) and the rating
 * (bottom right), and below it the name with the fitness bar. The caller positions it and makes it a button or not.
 */
export function PitchMarker({
  name, shortName, roleLabel, roleClass, roleTitle, face, rating, energy, selected, flagged, marks, corner, fitnessTitle,
}: {
  name: string;
  shortName: string;
  roleLabel: string;
  /** Text colour of the role (position colour, or the out-of-position colour). */
  roleClass: string;
  roleTitle?: string;
  face?: string;
  rating: number;
  energy: number;
  selected?: boolean;
  /** Queued to go off: an amber ring. */
  flagged?: boolean;
  /** Marks at the top right (card, injury, going off). */
  marks?: ReactNode;
  /** A mark at the bottom left (a new signing still settling in). */
  corner?: ReactNode;
  fitnessTitle?: string;
}) {
  return (
    <>
      <span
        className={`relative rounded-full ${
          selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : flagged ? "ring-2 ring-chart-4" : ""
        }`}
      >
        {face ? (
          <FaceImage src={face} size={40} fallback={playerInitials(name)} ringClassName={`border-2 border-current ${roleClass}`} />
        ) : (
          <span className={`w-10 h-10 rounded-full border-2 border-current bg-secondary flex items-center justify-center ${roleClass}`}>
            <span className="font-display text-sm text-foreground">{playerInitials(name)}</span>
          </span>
        )}
        <span
          className={`absolute -top-2 -left-3 min-w-7 rounded border border-current bg-background/95 px-1 text-center font-display font-bold uppercase text-[13px] leading-tight ${roleClass}`}
          title={roleTitle}
        >
          {roleLabel}
        </span>
        <span className={`absolute -bottom-1 -right-5 rounded border border-border bg-background/95 px-1 text-sm font-black tabular-nums leading-tight ${ratingTextClass10(rating)}`}>
          {rating.toFixed(1)}
        </span>
        {corner}
        {marks && <span className="absolute -top-2 -right-3 flex items-center gap-0.5">{marks}</span>}
      </span>
      <span
        className={`flex flex-col gap-0.5 w-[18cqw] rounded px-1.5 pt-0.5 pb-1 ${selected ? "bg-primary text-primary-foreground" : "bg-background/90 text-foreground"}`}
        title={fitnessTitle}
      >
        <span className="block min-w-0 truncate text-center text-sm font-semibold leading-tight">{shortName}</span>
        <span className="block h-1.5 rounded-full bg-border/70 overflow-hidden">
          <span className={`block h-full rounded-full ${energyBarClass(energy)}`} style={{ width: `${Math.max(0, Math.min(100, energy))}%` }} />
        </span>
      </span>
    </>
  );
}

/**
 * The layout of every tab of the substitutions panel: the mini pitch on the left; on the right the tab's title, a
 * one-line hint, its controls and its action at the bottom (stacked below md).
 */
export function PanelColumns({ pitch, title, hint, children, action }: {
  pitch: ReactNode;
  title: ReactNode;
  hint?: ReactNode;
  children?: ReactNode;
  /** The tab's main button, always at the bottom of the right column. */
  action?: ReactNode;
}) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 flex flex-col md:flex-row gap-6 md:items-stretch">
      <div className="shrink-0 w-full md:w-auto flex justify-center md:self-start">{pitch}</div>
      <div className="flex-1 min-w-0 w-full flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h3 className="font-display font-black uppercase text-xl leading-none m-0">{title}</h3>
          {hint && <p className="text-sm text-muted-foreground m-0">{hint}</p>}
        </div>
        {children}
        {action && <div className="mt-auto flex flex-col gap-2">{action}</div>}
      </div>
    </div>
  );
}

/** A labelled block inside a tab's right column. */
export function PanelBlock({ label, aside, children }: { label: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{label}</span>
        {aside}
      </div>
      {children}
    </div>
  );
}

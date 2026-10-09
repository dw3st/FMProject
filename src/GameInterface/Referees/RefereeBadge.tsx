import { useTranslation } from "react-i18next";
import { FaceImage, playerInitials, type PlayerFaceSize } from "@/GameInterface/Components/PlayerFace";
import { Flag } from "@/GameInterface/Components/Flag";
import { refereeFaceUrl } from "@/Domain/faces/faceUrl";
import { nationalityFlagCode } from "@/Domain/world/nationalityFlag";
import type { RefereeBand } from "@/types/refereeTypes";

/** What a screen needs to show a referee (never the raw rigor). */
export interface RefereeBadgeData {
  id: string;
  name: string;
  country: string;
  gender: "male" | "female";
  age: number | null;
  band?: RefereeBand;
  season?: { matches: number; yellowsPerMatch: number } | null;
}

const BAND_CLASS: Record<RefereeBand, string> = {
  lenient: "text-chart-2",
  balanced: "text-muted-foreground",
  strict: "text-destructive",
};

/** Referee face, kept separate so the tables can use it alone. */
export function RefereeFace({ referee, size }: { referee: RefereeBadgeData; size: PlayerFaceSize }) {
  return (
    <FaceImage
      src={refereeFaceUrl(referee.id, referee.country, referee.age, referee.gender === "female")}
      size={size}
      fallback={playerInitials(referee.name)}
      ringClassName="border-2 border-border"
    />
  );
}

/** The rigor band in words ("Tolerante" / "Equilibrado" / "Rigoroso"). */
export function RefereeBandLabel({ band }: { band: RefereeBand }) {
  const { t } = useTranslation();
  return <span className={`text-sm font-semibold ${BAND_CLASS[band]}`}>{t(`referees.band.${band}`)}</span>;
}

/**
 * Referee of a match: face, name, flag and (optionally) the rigor band with the season's numbers. `compact` is the
 * one-line form (Summary panel, result, day summary).
 */
export function RefereeBadge({ referee, size = 48, compact = false }: { referee: RefereeBadgeData; size?: PlayerFaceSize; compact?: boolean }) {
  const { t } = useTranslation();
  const flag = nationalityFlagCode(referee.country);
  return (
    <div className="flex items-center gap-3 min-w-0">
      <RefereeFace referee={referee} size={size} />
      <div className="min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-foreground truncate">{referee.name}</span>
          {flag && <Flag code={flag} />}
        </div>
        {!compact && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground tabular-nums">
            {referee.band && <RefereeBandLabel band={referee.band} />}
            {referee.season && referee.season.matches > 0
              ? <span>{t("referees.seasonLine", { matches: referee.season.matches, yellows: referee.season.yellowsPerMatch.toFixed(1) })}</span>
              : <span>{t("referees.noMatches")}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

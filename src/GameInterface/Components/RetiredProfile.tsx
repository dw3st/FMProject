import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ATTRIBUTE_LIST, attrDisplay } from "@/Domain/attributes";
import { computeOverallAvg } from "@/Domain/playerRating";
import { preferredRole } from "@/Domain/positions/positionAptitude";
import { nationalityFlagCode } from "@/Domain/world/nationalityFlag";
import { nationalityDisplayName } from "@/Domain/world/labels";
import { PlayerFace } from "@/GameInterface/Components/PlayerFace";
import { Flag } from "@/GameInterface/Components/Flag";
import { CareerTable } from "@/GameInterface/Components/CareerTable";
import { getDetailedPositionColor } from "@/GameInterface/positionHelpers";
import { attributeBarClass, attributeTextClass } from "@/GameInterface/scoreColors";
import type { LeagueData, RetiredPlayer, RosterPlayer } from "@/types/playerTypes";

type RetiredDetail = RetiredPlayer & { clubName: string | null };

/**
 * A retired player as he was in his last game (tester report): face, nationality, position, overall and the
 * attributes at retirement, his national-team line and the career table.
 */
export function RetiredProfile({ saveId, retiredId, leagues }: { saveId: string; retiredId: string; leagues: LeagueData[] }) {
  const { t, i18n } = useTranslation();
  const [rec, setRec] = useState<RetiredDetail | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/saves/${saveId}/retired/${encodeURIComponent(retiredId)}`)
      .then((r) => (r.ok ? (r.json() as Promise<RetiredDetail>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (alive) setRec(d); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [saveId, retiredId]);

  if (failed) return <p className="text-sm text-muted-foreground m-0">{t("warnings.errors.loadFailed")}</p>;
  if (!rec) return <p className="text-sm text-muted-foreground m-0">{t("statsScreen.loading")}</p>;

  // The record as a roster player, to read his position and overall the way the rest of the game does.
  const asPlayer = {
    id: rec.id, name: rec.name, age: rec.age, positions: rec.positions, preferredFoot: rec.preferredFoot,
    stats: rec.statsAtRetirement, nationality: rec.nationality, profile: rec.profile,
  } as unknown as RosterPlayer;
  const role = preferredRole(asPlayer);
  const overall = attrDisplay(computeOverallAvg(asPlayer));
  const peak = rec.peakLevel !== undefined ? attrDisplay(rec.peakLevel) : null;
  const flag = nationalityFlagCode(rec.nationality);
  const nation = rec.nationality ? nationalityDisplayName(rec.nationality, i18n.language, t) : null;
  const retiredOn = new Date(`${rec.retiredOn}T12:00:00Z`).toLocaleDateString(i18n.language, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="flex flex-wrap items-center gap-4">
        <PlayerFace playerId={rec.id} nationality={rec.nationality} size={64} fallback={rec.name.slice(0, 1)} />
        <div className="flex flex-col gap-1 min-w-0">
          <span className="font-display font-black uppercase text-xl leading-none truncate">{rec.name}</span>
          <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {flag && <Flag code={flag} />}
            {nation && <span>{nation}</span>}
            <span className={`font-bold ${getDetailedPositionColor(role)}`}>{t(`roles.detailedAbbr.${role}`, { defaultValue: role })}</span>
            <span>{t(rec.preferredFoot === "left" ? "dashboard.playerCard.leftFoot" : "dashboard.playerCard.rightFoot")}</span>
            <span className="tabular-nums">{t("statsScreen.retired.profile.retiredAt", { age: rec.age, date: retiredOn })}</span>
            {rec.clubName && <span>{rec.clubName}</span>}
          </span>
        </div>
        <div className="flex gap-6 ml-auto">
          <div className="flex flex-col items-end">
            <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{t("statsScreen.retired.profile.lastLevel")}</span>
            <span className={`font-display font-bold tabular-nums text-2xl ${attributeTextClass(overall)}`}>{overall}</span>
          </div>
          {peak !== null && (
            <div className="flex flex-col items-end">
              <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{t("statsScreen.retired.profile.peak")}</span>
              <span className={`font-display font-bold tabular-nums text-2xl ${attributeTextClass(peak)}`}>{peak}</span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-2">
        {ATTRIBUTE_LIST.map((a) => {
          const v = attrDisplay(rec.statsAtRetirement[a.id] ?? 0);
          return (
            <div key={a.id} className="flex items-center gap-3">
              <span className="w-28 shrink-0 text-sm text-muted-foreground truncate">{t(`attributeNames.${a.id}`)}</span>
              <div className="h-1.5 flex-1 min-w-16 rounded bg-border overflow-hidden" aria-hidden>
                <div className={`h-full rounded ${attributeBarClass(v)}`} style={{ width: `${Math.max(0, Math.min(100, v))}%` }} />
              </div>
              <span className={`w-8 text-right text-sm font-bold tabular-nums ${attributeTextClass(v)}`}>{v}</span>
            </div>
          );
        })}
      </div>

      {rec.national && rec.national.caps > 0 && (
        <p className="text-sm text-muted-foreground m-0 tabular-nums">
          {t("statsScreen.retired.profile.national", { apps: rec.national.caps, goals: rec.national.goals })}
        </p>
      )}

      <CareerTable rows={rec.history ?? []} leagues={leagues} />
    </div>
  );
}

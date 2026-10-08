import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScreenTitle } from "@/GameInterface/ui/ScreenTitle";
import { ScreenContainer } from "@/GameInterface/ui/ScreenContainer";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { FacilitiesView } from "@/GameInterface/Facilities/FacilitiesView";
import type { LeagueData } from "@/types/playerTypes";

/**
 * Club (#120): the club's facilities — stadium, training ground, academy and their items
 * (`.claude/rules/game/facilities.md`). Moved out of Finances, which keeps only the money.
 */
export function ClubScreen() {
  const { t } = useTranslation();
  const { session, squad, loading, fixtures } = useGameSave();
  const [leagues, setLeagues] = useState<LeagueData[]>([]);

  useEffect(() => {
    if (!loading && !session) window.location.href = "/new-game";
  }, [loading, session]);

  useEffect(() => {
    void fetch("/api/leagues")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: LeagueData[]) => setLeagues(Array.isArray(data) ? data : []))
      .catch(() => setLeagues([]));
  }, []);

  return (
    <ScreenContainer>
      <ScreenTitle accent={t("screenTitles.club.accent")}>{t("screenTitles.club.main")}</ScreenTitle>
      {session ? (
        <FacilitiesView
          saveId={session.saveId}
          squadId={squad?.id ?? session.clubId}
          fixtures={fixtures}
          leagues={leagues}
          currentDate={session.currentDate ?? null}
        />
      ) : (
        <p className="text-sm text-muted-foreground m-0">{t("financesScreen.loading")}</p>
      )}
    </ScreenContainer>
  );
}

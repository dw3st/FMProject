import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ScreenTitle } from "@/GameInterface/ui/ScreenTitle";
import { ScreenContainer } from "@/GameInterface/ui/ScreenContainer";
import type { Squad } from "@/types/playerTypes";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { sessionMatchesClubRoute } from "@/GameInterface/sessionClubMatch";
import { SquadRosterTable } from "@/GameInterface/SquadRosterTable";
import { Tabs } from "@/GameInterface/ui/Tabs";
import { YouthTable } from "@/GameInterface/Components/YouthTable";
import { ClubHistoryView } from "@/GameInterface/Components/ClubHistoryView";
import { PlayerOfferModal } from "@/GameInterface/Components/PlayerOfferModal";
import type { DisplayPlayer } from "@/Domain/scout/displayPlayer";
import type { TransferRecord } from "@/types/transferTypes";

export function SquadScreen({ league, club }: { league: string; club: string }) {
  const { t } = useTranslation();
  const { session, squad: mySquad, loading: saveLoading, refresh } = useGameSave();
  const [squad, setSquad] = useState<Squad | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [offerTarget, setOfferTarget] = useState<DisplayPlayer | null>(null);
  const [tab, setTab] = useState<"squad" | "youth" | "history">(() => {
    const q = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("tab") : null;
    return q === "youth" || q === "history" ? q : "squad";
  });
  const lastTransferResult = useRef<TransferRecord | null>(null);

  const mySquadId = mySquad?.id ?? session?.clubId ?? "";

  const fetchSquadForRoute = useCallback(() => {
    if (!session) return;
    setLoading(true);
    setError(false);
    const isMyClub = sessionMatchesClubRoute(session, league, club, mySquad);
    if (isMyClub && mySquad) {
      setSquad(mySquad);
      setLoading(false);
      return;
    }
    fetch(`/api/saves/${session.saveId}/squad/${league}/${club}?scouted=1`)
      .then((r) => {
        if (!r.ok) throw new Error("not found");
        return r.json();
      })
      .then((data: Squad) => {
        setSquad(data);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [session, league, club, mySquad]);

  useEffect(() => {
    if (saveLoading) return;
    if (!session) {
      window.location.href = "/new-game";
      return;
    }
    fetchSquadForRoute();
  }, [session, saveLoading, fetchSquadForRoute]);

  function handleTransferComplete(record: TransferRecord) {
    lastTransferResult.current = record;
  }

  function handleOfferClose() {
    const result = lastTransferResult.current;
    lastTransferResult.current = null;
    setOfferTarget(null);
    if (result?.status === "accepted") {
      void refresh();
      fetchSquadForRoute();
    }
  }

  if (saveLoading || loading) {
    return (
      <ScreenContainer>
        <p className="text-muted-foreground text-sm m-0">{t("squadScreen.loadingSquad")}</p>
      </ScreenContainer>
    );
  }

  if (error || !squad) {
    return (
      <ScreenContainer>
        <p className="text-muted-foreground text-sm m-0">{t("squadScreen.squadNotFound")}</p>
      </ScreenContainer>
    );
  }

  return (
    <>
    <ScreenContainer fill>
        <ScreenTitle
          accent={squad.name}
          trailing={
            <div className="text-sm text-muted-foreground font-semibold">{squad.players.length} {t("squadScreen.players")}</div>
          }
        >
          <span className="inline-flex items-center gap-3">
            <ClubLogo
              logoUrl={squadLogoUrl(squad.id)}
              primaryColor={squad.colors[0]}
              secondaryColor={squad.colors[1]}
              className="w-8 h-8 rounded-full shrink-0"
              imgClassName="w-full h-full object-contain p-0.5"
            />
            {t("screenTitles.squad.main")}
          </span>
        </ScreenTitle>

        <Tabs
          tabs={[
            { key: "squad", label: t("squadScreen.tabSquad") },
            ...(squad.id === mySquadId ? [{ key: "youth" as const, label: t("squadScreen.tabYouth") }] : []),
            { key: "history", label: t("squadScreen.tabHistory") },
          ]}
          active={tab}
          onChange={setTab}
        />

        {tab === "history" && session ? (
          <ClubHistoryView saveId={session.saveId} squadId={squad.id} leagueSlug={league} />
        ) : tab === "youth" && squad.id === mySquadId ? (
          <YouthTable />
        ) : (
          <SquadRosterTable
            squad={squad}
            leagueSlug={league}
            clubSlug={club}
            mySquadId={mySquadId}
            onOffer={setOfferTarget}
          />
        )}
    </ScreenContainer>

      <PlayerOfferModal
        player={offerTarget}
        onClose={handleOfferClose}
        onTransferComplete={handleTransferComplete}
      />
    </>
  );
}

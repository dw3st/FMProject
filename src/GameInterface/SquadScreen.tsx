import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { PageHeadline } from "@/GameInterface/Components/PageHeadline";
import type { Squad } from "@/types/playerTypes";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { sessionMatchesClubRoute } from "@/GameInterface/sessionClubMatch";
import { SquadRosterTable } from "@/GameInterface/SquadRosterTable";
import { PlayerOfferModal } from "@/GameInterface/Components/PlayerOfferModal";
import type { DisplayPlayer } from "@/GameInterface/playerHelpers";
import type { TransferRecord } from "@/types/transferTypes";

export function SquadScreen({ league, club }: { league: string; club: string }) {
  const { t } = useTranslation();
  const { session, squad: mySquad, loading: saveLoading, refresh } = useGameSave();
  const [squad, setSquad] = useState<Squad | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [offerTarget, setOfferTarget] = useState<DisplayPlayer | null>(null);
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
    fetch(`/api/saves/${session.saveId}/squad/${league}/${club}`)
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
    return <p className="text-muted-foreground text-sm p-6">{t("squadScreen.loadingSquad")}</p>;
  }

  if (error || !squad) {
    return (
      <div className="p-6 space-y-4">
        <PageHeadline hideTitle backHref={`/leagues/${league}`} />
        <p className="text-muted-foreground text-sm">{t("squadScreen.squadNotFound")}</p>
      </div>
    );
  }

  return (
    <div className="p-4 overflow-auto flex flex-col flex-1 min-h-0">
      <div className="max-w-6xl mx-auto w-full space-y-6 flex flex-col flex-1 min-h-0">

        <PageHeadline
          backHref={`/leagues/${league}`}
          trailing={
            <div className="text-sm text-muted-foreground font-semibold">{squad.players.length} {t("squadScreen.players")}</div>
          }
        >
          <span className="inline-flex items-center gap-3">
            <ClubLogo
              logoUrl={squadLogoUrl(squad.id)}
              primaryColor={squad.colors[0]}
              secondaryColor={squad.colors[1]}
              className="w-10 h-10 rounded-full shrink-0"
              imgClassName="w-full h-full object-contain p-0.5"
            />
            {squad.name}
          </span>
        </PageHeadline>

        <SquadRosterTable
          squad={squad}
          leagueSlug={league}
          clubSlug={club}
          mySquadId={mySquadId}
          onOffer={setOfferTarget}
        />
      </div>

      <PlayerOfferModal
        player={offerTarget}
        onClose={handleOfferClose}
        onTransferComplete={handleTransferComplete}
      />
    </div>
  );
}

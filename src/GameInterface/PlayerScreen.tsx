import { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { UserPlus } from "lucide-react";
import { PageHeadline } from "@/GameInterface/Components/PageHeadline";
import type { Squad, RosterPlayer } from "@/types/playerTypes";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { toDisplayPlayer } from "@/GameInterface/playerHelpers";
import type { DisplayPlayer } from "@/GameInterface/playerHelpers";
import { PlayerCard } from "@/GameInterface/Dashboard/PlayerCard";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { PlayerOfferModal } from "@/GameInterface/Components/PlayerOfferModal";
import type { TransferRecord } from "@/types/transferTypes";
import { sessionMatchesClubRoute } from "@/GameInterface/sessionClubMatch";

export function PlayerScreen({
  playerId,
  league,
  club,
}: {
  playerId: string;
  league: string;
  club: string;
}) {
  const { t } = useTranslation();
  const { session, squad: mySquad, loading: saveLoading, refresh } = useGameSave();
  const [player, setPlayer] = useState<RosterPlayer | null>(null);
  const [squadId, setSquadId] = useState("");
  const [squadName, setSquadName] = useState("");
  const [squadColors, setSquadColors] = useState<[string, string]>(["#555", "#888"]);
  const [loading, setLoading] = useState(true);
  const [offerTarget, setOfferTarget] = useState<DisplayPlayer | null>(null);
  const lastTransferResult = useRef<TransferRecord | null>(null);

  useEffect(() => {
    if (saveLoading) return;
    if (!session) {
      window.location.href = "/new-game";
      return;
    }
    const isMyClub = sessionMatchesClubRoute(session, league, club, mySquad);
    if (isMyClub && mySquad) {
      const found = mySquad.players.find((p) => p.id === playerId) ?? null;
      setPlayer(found);
      setSquadId(mySquad.id);
      setSquadName(mySquad.name);
      setSquadColors(mySquad.colors);
      setLoading(false);
      return;
    }
    fetch(`/api/saves/${session.saveId}/squad/${league}/${club}`)
      .then((r) => r.json())
      .then((data: Squad) => {
        const found = data.players.find((p) => p.id === playerId) ?? null;
        setPlayer(found);
        setSquadId(data.id);
        setSquadName(data.name);
        setSquadColors(data.colors);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [league, club, playerId, session, mySquad, saveLoading]);

  const displayPlayer = useMemo((): DisplayPlayer | null => {
    if (!player || !squadName) return null;
    const dp = toDisplayPlayer(player, squadName);
    return { ...dp, leagueSlug: league, clubSlug: club };
  }, [player, squadName, league, club]);

  const mySquadId = mySquad?.id ?? session?.clubId ?? "";
  const isOwnPlayer = !!player && !!mySquadId && player.squadId === mySquadId;

  const backTo = `/squad/${league}/${club}`;

  function handleTransferComplete(record: TransferRecord) {
    lastTransferResult.current = record;
  }

  function handleOfferClose() {
    const result = lastTransferResult.current;
    lastTransferResult.current = null;
    setOfferTarget(null);
    if (result?.status === "accepted") {
      void refresh();
      window.location.href = "/dashboard";
    }
  }

  if (saveLoading || loading) {
    return <p className="text-muted-foreground text-sm p-6">{t("playerScreen.loadingPlayer")}</p>;
  }

  if (!player || !displayPlayer) {
    return (
      <div className="space-y-4 max-w-2xl p-6">
        <PageHeadline hideTitle backHref={backTo} backLabel={t("playerScreen.backToSquad")} />
        <p className="text-muted-foreground text-sm">{t("playerScreen.playerNotFound")}</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 pb-12 overflow-auto">
      <div className="max-w-6xl mx-auto space-y-5 md:space-y-6">
        <PageHeadline
          hideTitle
          backHref={backTo}
          trailing={
            !isOwnPlayer ? (
              <button
                type="button"
                onClick={() => setOfferTarget(displayPlayer)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-wider glow-primary hover:scale-[1.02] transition-all cursor-pointer border-0 shrink-0"
              >
                <UserPlus className="w-4 h-4" />
                {t("playerScreen.makeOffer")}
              </button>
            ) : undefined
          }
        />

        <a
          href={backTo}
          className="card-arcade rounded-xl p-4 md:p-5 flex flex-col sm:flex-row sm:items-center gap-4 md:gap-6 border border-border hover:border-primary/40 transition-colors no-underline group"
        >
          <ClubLogo
            logoUrl={squadLogoUrl(squadId)}
            primaryColor={squadColors[0]}
            secondaryColor={squadColors[1]}
            className="w-14 h-14 md:w-16 md:h-16 rounded-full shrink-0 border border-border/50"
            imgClassName="w-full h-full object-contain p-1"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] md:text-xs font-bold text-muted-foreground uppercase tracking-wider m-0">
              {t("playerScreen.currentTeam")}
            </p>
            <p className="text-lg md:text-xl font-black text-foreground font-display truncate m-0 group-hover:text-primary transition-colors">
              {squadName}
            </p>
            <p className="text-xs text-primary font-semibold m-0 mt-1">{t("playerScreen.openSquadPage")}</p>
          </div>
        </a>

        <PlayerCard player={displayPlayer} layout="wide" />
      </div>

      <PlayerOfferModal
        player={offerTarget}
        onClose={handleOfferClose}
        onTransferComplete={handleTransferComplete}
      />
    </div>
  );
}

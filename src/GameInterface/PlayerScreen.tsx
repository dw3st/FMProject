import { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
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
import { wageFactorOf } from "@/Domain/finance/wages";
import { ContractOfferModal } from "@/GameInterface/Contracts/ContractOfferModal";
import { Icon } from "@/GameInterface/Icons";
import { CareerTable } from "@/GameInterface/Components/CareerTable";
import { historyRowFromLog } from "@/Domain/history/history";
import type { LeagueData } from "@/types/playerTypes";

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
  const [squadWageFactor, setSquadWageFactor] = useState(1);
  const [loading, setLoading] = useState(true);
  const [offerTarget, setOfferTarget] = useState<DisplayPlayer | null>(null);
  const [renewOpen, setRenewOpen] = useState(false);
  const lastTransferResult = useRef<TransferRecord | null>(null);
  const [leagues, setLeagues] = useState<LeagueData[]>([]);

  useEffect(() => {
    void fetch("/api/leagues").then((r) => (r.ok ? r.json() : [])).then(setLeagues).catch(() => setLeagues([]));
  }, []);

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
      setSquadWageFactor(wageFactorOf(mySquad));
      setLoading(false);
      return;
    }
    fetch(`/api/saves/${session.saveId}/squad/${league}/${club}?scouted=1`)
      .then((r) => r.json())
      .then((data: Squad) => {
        const found = data.players.find((p) => p.id === playerId) ?? null;
        setPlayer(found);
        setSquadId(data.id);
        setSquadName(data.name);
        setSquadColors(data.colors);
        setSquadWageFactor(wageFactorOf(data));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [league, club, playerId, session, mySquad, saveLoading]);

  const displayPlayer = useMemo((): DisplayPlayer | null => {
    if (!player || !squadName) return null;
    const dp = toDisplayPlayer(player, squadName, { wageFactor: squadWageFactor, currentDate: session?.currentDate });
    return { ...dp, leagueSlug: league, clubSlug: club };
  }, [player, squadName, squadWageFactor, league, club, session?.currentDate]);

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
      <div className="space-y-4 max-w-2xl px-6 py-5">
        <PageHeadline hideTitle backHref={backTo} backLabel={t("playerScreen.backToSquad")} />
        <p className="text-muted-foreground text-sm">{t("playerScreen.playerNotFound")}</p>
      </div>
    );
  }

  return (
    <div className="px-6 py-5 pb-12 overflow-auto">
      <div className="max-w-6xl mx-auto space-y-5 md:space-y-6">
        <PageHeadline
          hideTitle
          backHref={backTo}
          trailing={
            !isOwnPlayer ? (
              <button
                type="button"
                onClick={() => setOfferTarget(displayPlayer)}
                className="flex items-center gap-2 px-5 h-10 rounded bg-primary text-primary-foreground text-[13px] font-semibold cursor-pointer border-0 shrink-0"
              >
                <Icon name="user-plus" className="w-4 h-4" />
                {t("playerScreen.makeOffer")}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setRenewOpen(true)}
                className="flex items-center gap-2 px-5 h-10 rounded bg-primary text-primary-foreground text-[13px] font-semibold cursor-pointer border-0 shrink-0"
              >
                <Icon name="file-signature" className="w-4 h-4" />
                {t("contracts.renew")}
              </button>
            )
          }
        />

        <a
          href={backTo}
          className="card-arcade rounded-md p-4 md:p-5 flex flex-col sm:flex-row sm:items-center gap-4 md:gap-6 border border-border hover:border-primary/40 transition-colors no-underline group"
        >
          <ClubLogo
            logoUrl={squadLogoUrl(squadId)}
            primaryColor={squadColors[0]}
            secondaryColor={squadColors[1]}
            className="w-16 h-16 rounded-full shrink-0"
            imgClassName="w-full h-full object-contain p-1"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] md:text-[13px] font-bold text-muted-foreground uppercase tracking-[0.08em] m-0 font-display">
              {t("playerScreen.currentTeam")}
            </p>
            <p className="text-lg md:text-xl font-black text-foreground font-display truncate m-0 group-hover:text-primary transition-colors">
              {squadName}
            </p>
            <p className="text-sm text-primary font-semibold m-0 mt-1">{t("playerScreen.openSquadPage")}</p>
          </div>
        </a>

        <PlayerCard player={displayPlayer} layout="wide" clubColors={squadColors} />

        <section className="space-y-2">
          <h2 className="font-display font-black uppercase text-xl leading-none m-0">{t("career.title")}</h2>
          <CareerTable
            rows={player.history ?? []}
            current={historyRowFromLog(player.seasonLog, { squadId, clubName: squadName, league }, "", [], player.history)}
            leagues={leagues}
          />
        </section>
      </div>

      <ContractOfferModal
        mode="renew"
        player={renewOpen ? {
          id: player.id, name: player.name, age: player.age, squadId: player.squadId,
          contractUntil: player.contract?.until.slice(0, 4),
        } : null}
        onClose={() => setRenewOpen(false)}
        onDone={() => void refresh()}
      />

      <PlayerOfferModal
        player={offerTarget}
        onClose={handleOfferClose}
        onTransferComplete={handleTransferComplete}
      />
    </div>
  );
}

import { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { formatBirthDate, heightCmOf } from "@/GameInterface/playerIdentity";
import { ScreenTitle } from "@/GameInterface/ui/ScreenTitle";
import { ScreenContainer } from "@/GameInterface/ui/ScreenContainer";
import type { Squad, RosterPlayer } from "@/types/playerTypes";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { toDisplayPlayer } from "@/Domain/scout/displayPlayer";
import type { DisplayPlayer } from "@/Domain/scout/displayPlayer";
import { PlayerCard } from "@/GameInterface/Dashboard/PlayerCard";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { PlayerOfferModal } from "@/GameInterface/Components/PlayerOfferModal";
import type { TransferRecord } from "@/types/transferTypes";
import { sessionMatchesClubRoute } from "@/GameInterface/sessionClubMatch";
import { wageFactorOf } from "@/Domain/finance/wages";
import { ContractOfferModal } from "@/GameInterface/Contracts/ContractOfferModal";
import { Icon } from "@/GameInterface/Icons";
import { CareerTable } from "@/GameInterface/Components/CareerTable";
import { ListToggles } from "@/GameInterface/Negotiation/ListToggles";
import { PlayerMoralePanel } from "@/GameInterface/Morale/PlayerMoralePanel";
import { PersonalityPanel, PersonalitySummaryBadge } from "@/GameInterface/Components/PersonalityPanel";
import { personalityViewOf } from "@/Domain/personality/personality";
import { historyRowFromLog } from "@/Domain/history/history";
import { addDays } from "@/Domain/dates";
import { useTransferWindows, windowClosedText } from "@/GameInterface/Transfers/transferWindow";
import type { LeagueData } from "@/types/playerTypes";
import { PlayerKnowledgePanel } from "@/GameInterface/Scouting/PlayerKnowledgePanel";
import { playerMarketValue } from "@/Domain/negotiation/askingPrice";

export function PlayerScreen({
  playerId,
  league,
  club,
}: {
  playerId: string;
  league: string;
  club: string;
}) {
  const { t, i18n } = useTranslation();
  const { session, squad: mySquad, loading: saveLoading, refresh } = useGameSave();
  const [player, setPlayer] = useState<RosterPlayer | null>(null);
  const [squadId, setSquadId] = useState("");
  const [squadName, setSquadName] = useState("");
  const [squadColors, setSquadColors] = useState<[string, string]>(["#555", "#888"]);
  const [squadWageFactor, setSquadWageFactor] = useState(1);
  const [loading, setLoading] = useState(true);
  const [offerTarget, setOfferTarget] = useState<DisplayPlayer | null>(null);
  // Transfer window of the human club (Etapa 25): closed = no offer, but a pre-contract when eligible.
  const windowsData = useTransferWindows();
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

  const identityFacts = useMemo((): string[] => {
    if (!player) return [];
    const facts: string[] = [];
    const born = player.birthDate ? formatBirthDate(player.birthDate, i18n.language) : null;
    if (born) facts.push(t("playerScreen.birthDate", { date: born }));
    const cm = heightCmOf(player.heightCm);
    if (cm !== null) facts.push(t("playerScreen.height", { cm }));
    return facts;
  }, [player, i18n.language, t]);

  const mySquadId = mySquad?.id ?? session?.clubId ?? "";
  const isOwnPlayer = !!player && !!mySquadId && player.squadId === mySquadId;

  const backTo = `/squad/${league}/${club}`;
  const today = session?.currentDate ?? "";
  const canPreContract = !!player?.contract && !!today && player.contract.until >= today && player.contract.until <= addDays(today, 183);
  const offerState: "open" | "closed" | "precontract" =
    !windowsData || windowsData.player.open ? "open" : canPreContract ? "precontract" : "closed";

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
    return (
      <ScreenContainer>
        <p className="text-muted-foreground text-sm m-0">{t("playerScreen.loadingPlayer")}</p>
      </ScreenContainer>
    );
  }

  if (!player || !displayPlayer) {
    return (
      <ScreenContainer>
        <p className="text-muted-foreground text-sm m-0">{t("playerScreen.playerNotFound")}</p>
      </ScreenContainer>
    );
  }

  return (
    <>
    <ScreenContainer>
        <ScreenTitle
          accent={t("screenTitles.player.accent")}
          trailing={
            !isOwnPlayer && !player.loan ? (
              <button
                type="button"
                disabled={offerState === "closed"}
                onClick={() => setOfferTarget(displayPlayer)}
                title={offerState === "closed" ? windowClosedText(t, i18n.language, windowsData?.player.opensOn) : undefined}
                className="flex items-center gap-2 px-5 h-10 rounded bg-primary text-primary-foreground text-sm font-semibold cursor-pointer border-0 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Icon name="user-plus" className="w-4 h-4" />
                {offerState === "closed"
                  ? windowClosedText(t, i18n.language, windowsData?.player.opensOn)
                  : offerState === "precontract" ? t("negotiation.preContract.tab") : t("playerScreen.makeOffer")}
              </button>
            ) : isOwnPlayer && !player.loan ? (
              <div className="flex flex-wrap items-center justify-end gap-2">
                {session && <ListToggles saveId={session.saveId} playerId={player.id} playerName={player.name} value={playerMarketValue(player)} />}
                <button
                  type="button"
                  onClick={() => setRenewOpen(true)}
                  className="flex items-center gap-2 px-5 h-10 rounded bg-primary text-primary-foreground text-sm font-semibold cursor-pointer border-0 shrink-0"
                >
                  <Icon name="file-signature" className="w-4 h-4" />
                  {t("contracts.renew")}
                </button>
              </div>
            ) : undefined
          }
        >
          {t("screenTitles.player.main")}
        </ScreenTitle>

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
            <p className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0">
              {t("playerScreen.currentTeam")}
            </p>
            <p className="text-lg md:text-xl font-black text-foreground font-display truncate m-0 group-hover:text-primary transition-colors">
              {squadName}
            </p>
            <p className="text-sm text-primary font-semibold m-0 mt-1">{t("playerScreen.openSquadPage")}</p>
          </div>
        </a>

        <PlayerCard
          player={displayPlayer}
          layout="wide"
          clubColors={squadColors}
          nameBadge={<PersonalitySummaryBadge view={personalityViewOf(player)} className="mt-0.5" />}
          identityFacts={identityFacts}
        />

        {!isOwnPlayer && session && (
          <PlayerKnowledgePanel saveId={session.saveId} playerId={player.id} squadId={squadId} />
        )}

        <PersonalityPanel player={player} />

        {isOwnPlayer && !player.loan && session && (
          <PlayerMoralePanel
            saveId={session.saveId}
            playerId={player.id}
            playerName={player.name}
            onRenew={() => setRenewOpen(true)}
            onChanged={() => void refresh()}
          />
        )}

        <section className="space-y-2">
          <h2 className="font-display font-black uppercase text-xl leading-none m-0">{t("career.title")}</h2>
          <CareerTable
            rows={player.history ?? []}
            current={(() => {
              const row = historyRowFromLog(player.seasonLog, { squadId, clubName: squadName, league }, "", [], player.history);
              return row && player.loan ? { ...row, loan: true as const } : row;
            })()}
            leagues={leagues}
          />
        </section>
    </ScreenContainer>

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
    </>
  );
}

import { useState, useEffect, useCallback, useRef } from "react";
import { HUMAN_MAX_SQUAD } from "@/Domain/contracts/contractConfig";
import { useTranslation } from "react-i18next";
import { ScreenTitle } from "@/GameInterface/ui/ScreenTitle";
import { StarCount } from "@/GameInterface/Squad/StarLimitLine";
import { ScreenContainer } from "@/GameInterface/ui/ScreenContainer";
import { HumanBadge } from "@/GameInterface/World/HumanBadge";
import { useHumanClubs } from "@/GameInterface/World/useHumanClubs";
import type { Squad } from "@/types/playerTypes";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { sessionMatchesClubRoute } from "@/GameInterface/sessionClubMatch";
import { SquadRosterTable } from "@/GameInterface/SquadRosterTable";
import { SegmentedTabs } from "@/GameInterface/ui/SegmentedTabs";
import { YouthTable } from "@/GameInterface/Components/YouthTable";
import { YouthCallUpsPanel } from "@/GameInterface/Squad/YouthCallUpsPanel";
import { ClubHistoryView } from "@/GameInterface/Components/ClubHistoryView";
import { SquadDepthView } from "@/GameInterface/Components/SquadDepthView";
import { RegistrationView } from "@/GameInterface/Squad/RegistrationView";
import { PlayerOfferModal } from "@/GameInterface/Components/PlayerOfferModal";
import { NegotiationOverview } from "@/GameInterface/Negotiation/NegotiationOverview";
import { MoralePromises } from "@/GameInterface/Morale/MoralePromises";
import { ClubOverviewView } from "@/GameInterface/Components/ClubOverviewView";
import type { DisplayPlayer } from "@/Domain/scout/displayPlayer";
import type { TransferRecord } from "@/types/transferTypes";
import { navigate } from "@/GameInterface/router/navigation";

export function SquadScreen({ league, club }: { league: string; club: string }) {
  const { t } = useTranslation();
  const { session, squad: mySquad, loading: saveLoading, refresh } = useGameSave();
  const [squad, setSquad] = useState<Squad | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [offerTarget, setOfferTarget] = useState<DisplayPlayer | null>(null);
  // Another club's page opens on its overview (tester report, 8.9.30); the own club on the squad.
  const [tab, setTab] = useState<"overview" | "squad" | "depth" | "registration" | "youth" | "loans" | "history" | null>(() => {
    const q = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("tab") : null;
    return q === "youth" || q === "history" || q === "loans" || q === "depth" || q === "registration" || q === "squad" || q === "overview" ? q : null;
  });
  const lastTransferResult = useRef<TransferRecord | null>(null);

  const mySquadId = mySquad?.id ?? session?.clubId ?? "";
  const humanClubs = useHumanClubs(session?.saveId, !!session?.groupAdvance);
  // Pre-contracts already signed: they keep places under the squad limit (tester report, 4.47.23).
  const [arriving, setArriving] = useState(0);
  useEffect(() => {
    if (!session?.saveId || !mySquadId) return;
    let alive = true;
    void fetch(`/api/saves/${session.saveId}/pre-contracts`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list: { toClubId?: string }[]) => { if (alive) setArriving(list.filter((p) => p.toClubId === mySquadId).length); })
      .catch(() => {});
    return () => { alive = false; };
  }, [session?.saveId, mySquadId]);

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
      navigate("/new-game");
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

  const own = squad.id === mySquadId;
  const activeTab = tab ?? (own ? "squad" : "overview");

  return (
    <>
    <ScreenContainer fill>
        <ScreenTitle
          accent={squad.name}
          trailing={
            <div className="flex items-center gap-3">
              {squad.id !== mySquadId && humanClubs.get(squad.id) && <HumanBadge nickname={humanClubs.get(squad.id)!} />}
              {squad.id === mySquadId ? (
                // The squad against its limit (tester report, 4.47.22).
                <div
                  className={`text-sm font-semibold tabular-nums ${squad.players.length >= HUMAN_MAX_SQUAD ? "text-chart-4" : "text-muted-foreground"}`}
                  title={t("squadScreen.squadLimitHint", { max: HUMAN_MAX_SQUAD })}
                >
                  {t("squadScreen.squadLimit", { n: squad.players.length, max: HUMAN_MAX_SQUAD })}
                  {arriving > 0 && <span className="text-muted-foreground font-normal">{" · "}{t("squadScreen.arriving", { count: arriving })}</span>}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground font-semibold">{squad.players.length} {t("squadScreen.players")}</div>
              )}
              {squad.id === mySquadId && <StarCount />}
            </div>
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

        <SegmentedTabs
          tabs={[
            ...(!own ? [{ key: "overview" as const, label: t("clubOverview.tabOverview") }] : []),
            { key: "squad", label: t("squadScreen.tabSquad") },
            ...(squad.id === mySquadId ? [{ key: "depth" as const, label: t("squadScreen.tabDepth") }] : []),
            ...(squad.id === mySquadId ? [{ key: "registration" as const, label: t("squadScreen.tabRegistration") }] : []),
            ...(squad.id === mySquadId ? [{ key: "youth" as const, label: t("squadScreen.tabYouth") }] : []),
            ...(squad.id === mySquadId ? [{ key: "loans" as const, label: t("negotiation.overview.loanedOutTab") }] : []),
            { key: "history", label: t("squadScreen.tabHistory") },
          ]}
          active={activeTab}
          onChange={setTab}
        />

        {activeTab === "overview" && !own && session ? (
          <div className="overflow-y-auto min-h-0"><ClubOverviewView saveId={session.saveId} squad={squad} onSquadTab={() => setTab("squad")} /></div>
        ) : activeTab === "history" && session ? (
          <ClubHistoryView saveId={session.saveId} squadId={squad.id} leagueSlug={league} />
        ) : activeTab === "depth" && squad.id === mySquadId ? (
          <SquadDepthView squad={squad} leagueSlug={league} clubSlug={club} />
        ) : activeTab === "registration" && squad.id === mySquadId ? (
          <RegistrationView />
        ) : activeTab === "youth" && squad.id === mySquadId ? (
          <div className="space-y-6">
            <YouthCallUpsPanel />
            <YouthTable />
          </div>
        ) : activeTab === "loans" && squad.id === mySquadId && session ? (
          <NegotiationOverview saveId={session.saveId} sections={["out", "in"]} />
        ) : (
          <>
          {squad.id === mySquadId && (
            <MoralePromises
              talks={squad.moraleClub?.talks ?? []}
              promises={squad.moraleClub?.promises ?? []}
              playerHref={(id) => `/player/${encodeURIComponent(league)}/${encodeURIComponent(club)}/${encodeURIComponent(id)}`}
            />
          )}
          <SquadRosterTable
            squad={squad}
            leagueSlug={league}
            clubSlug={club}
            mySquadId={mySquadId}
            onOffer={setOfferTarget}
          />
          </>
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

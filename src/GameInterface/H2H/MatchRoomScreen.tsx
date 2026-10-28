import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { Icon } from "@/GameInterface/Icons";
import { useH2HSocket } from "@/GameInterface/H2H/useH2HSocket";
import { writeH2HInvite } from "@/GameInterface/H2H/h2hInvite";
import { groupAdvanceApi } from "@/GameInterface/World/groupAdvanceApi";
import { groupAdvanceErrorKey } from "@/GameInterface/World/groupAdvanceErrors";
import { useGroupAdvance } from "@/GameInterface/World/GroupAdvanceProvider";
import { Button } from "@/GameInterface/ui/Button";
import { PenaltyModeChips } from "@/GameInterface/Penalty/PenaltyModeChips";
import { loadPenaltyMode } from "@/GameInterface/Penalty/penaltyMode";
import { ScreenContainer } from "@/GameInterface/ui/ScreenContainer";
import { ScreenTitle } from "@/GameInterface/ui/ScreenTitle";
import type { H2HSide, H2HSideView } from "@/types/h2hTypes";

const STATUS_CLASS = { away: "text-muted-foreground", in: "text-foreground", ready: "text-primary" } as const;
/** How long the reason a room closed stays on screen before the dashboard. */
const CLOSED_REDIRECT_MS = 3000;

const other = (side: H2HSide): H2HSide => (side === "A" ? "B" : "A");
const nameOf = (s: H2HSideView) => s.nickname ?? s.clubName;

function SideCard({ side, me }: { side: H2HSideView; me: boolean }) {
  const { t } = useTranslation();
  return (
    <div className={`flex-1 min-w-[240px] rounded-md border bg-card p-4 flex items-center gap-4 ${me ? "border-primary" : "border-border"}`}>
      <ClubLogo logoUrl={squadLogoUrl(side.clubId)} className="w-16 h-16 shrink-0" />
      <div className="min-w-0 flex flex-col gap-1">
        <span className="text-base font-semibold text-foreground truncate">{side.clubName}</span>
        <span className="text-sm text-muted-foreground truncate">
          {nameOf(side)}{me ? ` · ${t("h2h.room.you")}` : ""}
        </span>
        <span className={`font-display font-bold uppercase tracking-[0.08em] text-[13px] ${STATUS_CLASS[side.status]}`}>
          {t(`h2h.room.status.${side.status}`)}
        </span>
      </div>
    </div>
  );
}

/**
 * The match room of a game against another manager (multiplayer part 7): both crests and managers with their state,
 * Start (ready) and Simulate. The match starts when both are ready; the page then goes to the live match.
 */
export function MatchRoomScreen() {
  const { t } = useTranslation();
  const { session } = useGameSave();
  const { view } = useGroupAdvance();
  const saveId = session?.saveId ?? "";
  const today = view?.me.matchToday ?? null;
  const playable = !!view && !view.running && !!today?.humanOpponent && !view.me.decision;
  const target = playable && saveId && today ? { saveId, fixtureId: today.fixtureId } : null;
  const h2h = useH2HSocket(target);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const goingLive = useRef(false);
  const room = h2h.room;
  const mySide = h2h.mySide;
  const lobby = room?.phase === "lobby";

  // The invite is answered: no corner card for this game any more.
  useEffect(() => {
    if (target) writeH2HInvite(null);
  }, [target?.saveId, target?.fixtureId]);

  useEffect(() => {
    if (room?.phase === "live" && !goingLive.current) {
      goingLive.current = true;
      window.location.href = "/match?h2h=1";
    }
  }, [room?.phase]);

  useEffect(() => {
    if (!h2h.closed) return;
    const timer = setTimeout(() => { window.location.href = "/dashboard"; }, CLOSED_REDIRECT_MS);
    return () => clearTimeout(timer);
  }, [h2h.closed]);

  // Leaving the page empties the seat in the room (the socket closing does it too; this is immediate).
  const leaveRef = useRef(h2h.leave);
  leaveRef.current = h2h.leave;
  const lobbyRef = useRef(lobby);
  lobbyRef.current = lobby;
  useEffect(() => {
    const onHide = () => { if (lobbyRef.current && !goingLive.current) leaveRef.current(); };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      onHide();
    };
  }, []);

  const simulate = async () => {
    if (!view || !today || busy) return;
    setBusy(true);
    setError(null);
    const r = await groupAdvanceApi.simulate(saveId, view.currentDate, today.fixtureId);
    if (!r.ok) {
      setBusy(false);
      setError(r.error);
      return;
    }
    h2h.leave();
    window.location.href = "/dashboard";
  };

  const title = (
    <ScreenTitle accent={t("screenTitles.matchRoom.accent")}>{t("screenTitles.matchRoom.main")}</ScreenTitle>
  );

  if (view && !target && !room) {
    return (
      <ScreenContainer>
        {title}
        <p className="text-sm text-muted-foreground m-0">{t("h2h.room.noMatch")}</p>
        <a href="/dashboard" className="text-primary font-bold text-sm no-underline hover:underline w-fit">{t("common.backToDashboard")}</a>
      </ScreenContainer>
    );
  }

  if (h2h.closed) {
    return (
      <ScreenContainer>
        {title}
        <p className="text-sm text-foreground m-0" role="status">{t(`h2h.closed.${h2h.closed}`)}</p>
        <a href="/dashboard" className="text-primary font-bold text-sm no-underline hover:underline w-fit">{t("common.backToDashboard")}</a>
      </ScreenContainer>
    );
  }

  if (!room || !mySide) {
    return (
      <ScreenContainer>
        {title}
        <p className="text-sm text-muted-foreground m-0">{t("common.loading")}</p>
      </ScreenContainer>
    );
  }

  const me = room.sides[mySide];
  const them = room.sides[other(mySide)];
  const imReady = me.status === "ready";
  const statusLine = imReady && them.status === "ready"
    ? t("h2h.room.starting")
    : t(`h2h.room.line.${them.status}`, { name: nameOf(them) });

  return (
    <ScreenContainer>
      <ScreenTitle accent={t("screenTitles.matchRoom.accent")} subtitle={t("h2h.room.subtitle")}>
        {t("screenTitles.matchRoom.main")}
      </ScreenTitle>
      <div className="flex flex-wrap gap-4">
        <SideCard side={room.sides.A} me={mySide === "A"} />
        <SideCard side={room.sides.B} me={mySide === "B"} />
      </div>
      <p className="text-sm text-foreground m-0" role="status" aria-live="polite">{statusLine}</p>
      {error && <p className="text-sm text-destructive m-0" role="alert">{t(groupAdvanceErrorKey(error))}</p>}
      <PenaltyModeChips disabled={imReady || !lobby} />
      <div className="flex flex-wrap items-center gap-4">
        <Button variant="secondary" onClick={() => { window.location.href = "/formation"; }}>
          <Icon name="settings" size={16} />
          {t("h2h.room.tactics")}
        </Button>
        <Button variant="secondary" onClick={() => void simulate()} disabled={busy || !lobby}>
          {t("h2h.room.simulate")}
        </Button>
        <Button onClick={() => h2h.ready(loadPenaltyMode() === "manual")} disabled={imReady || busy || !lobby}>
          {imReady ? t("h2h.room.ready") : t("h2h.room.start")}
          {!imReady && <Icon name="play" size={16} />}
        </Button>
      </div>
    </ScreenContainer>
  );
}

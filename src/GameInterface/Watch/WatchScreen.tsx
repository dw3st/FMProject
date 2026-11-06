import { LiveCompetitionLine } from "@/GameInterface/World/LiveCompetitionLine";
import { useEffect, useMemo, useRef, useState } from "react";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import { useTranslation } from "react-i18next";
import { PixiPitch, type PitchLighting, type PitchOfficials, type PitchStadium } from "@/GraficsEngine/PixiPitch";
import { isLivePhase, matchMinute } from "@/GameEngine/Domain/gameState";
import type { TeamId } from "@/GameEngine/types";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { LiveMoments } from "@/GameInterface/World/LiveMoments";
import { Button } from "@/GameInterface/ui/Button";
import { Icon } from "@/GameInterface/Icons";
import { useWatchSocket } from "@/GameInterface/Watch/useWatchSocket";
import { MatchSocial } from "@/GameInterface/Social/MatchSocial";
import { useSocial } from "@/GameInterface/Social/useSocial";
import { TauntActions } from "@/GameInterface/World/TauntActions";
import { liveGroups } from "@/Domain/rivals/taunts";
import { worldRoomParam } from "@/Domain/social/rooms";
import type { WatchInfo, WatchLook } from "@/types/watchTypes";
import { navigate } from "@/GameInterface/router/navigation";

const PITCH_ASPECT = 1.62;

type PitchProps = Parameters<typeof PixiPitch>[0];

/** Engine team of the home side (listed on the left). */
function homeSideOf(info: WatchInfo): TeamId {
  const homeClub = info.live.home ? info.live.clubId : info.live.opponentId;
  return info.teams.A.id === homeClub ? "A" : "B";
}

/** The friend's pitch props from his look (kits, faces, stadium, turf, light, officials, managers). */
function pitchPropsOf(info: WatchInfo, look: WatchLook | null, ledGoal: string): Partial<PitchProps> {
  if (!look) return { teamAColor: info.teams.A.colors[0], teamBColor: info.teams.B.colors[0] };
  return {
    teamAColor: look.teamAColor,
    teamBColor: look.teamBColor,
    ...(look.teamAColor2 ? { teamAColor2: look.teamAColor2 } : {}),
    ...(look.teamBColor2 ? { teamBColor2: look.teamBColor2 } : {}),
    ...(look.faceUrls ? { faceUrls: look.faceUrls } : {}),
    stadium: look.stadium ? ({ ...look.stadium, led: { goal: ledGoal } } as unknown as PitchStadium) : null,
    pitch: (look.pitch ?? null) as PitchProps["pitch"],
    lighting: (look.lighting ?? null) as PitchLighting | null,
    ...(look.officials !== undefined ? { officials: look.officials as boolean | PitchOfficials } : {}),
    ...(look.coaches ? { coaches: look.coaches as PitchProps["coaches"] } : {}),
  };
}

/**
 * A friend's live match as a broadcast (spec 2026-10-29-friend-match-broadcast-design): the score bar, the pitch drawn
 * exactly as on his screen (his kits, faces, stadium, turf and light) and the latest moments. Read only.
 */
export function WatchBroadcast({ saveId, seatId, onClose, onChat, embed = false, follow = false }: {
  saveId: string;
  seatId: string;
  onClose: () => void;
  /** Opens the league chat, the room of the banter (report). */
  onChat: () => void;
  /** Inside the floating window: it has its own close button, and a narrow window drops the side column. */
  embed?: boolean;
  /** Own window following the friend: a finished match waits for his next one instead of closing. */
  follow?: boolean;
}) {
  const { t } = useTranslation();
  const target = useMemo(() => ({ saveId, seatId }), [saveId, seatId]);
  const w = useWatchSocket(target, follow);
  // The friend's nickname, kept between his matches for the waiting line.
  const nickRef = useRef<string | null>(null);
  if (w.info) nickRef.current = w.info.nickname;
  const waiting = follow && (w.closed === "ended" || w.closed === "gone");
  const waitingText = nickRef.current ? t("watch.waitingNext", { name: nickRef.current }) : t("watch.waitingNextAnon");
  const [coachCard, setCoachCard] = useState<{ team: "A" | "B"; card: "yellow" | "red"; seq: number } | null>(null);
  useEffect(() => gameBus.on("managerCard", (e) => {
    setCoachCard((prev) => ({ team: e.team, card: e.card, seq: (prev?.seq ?? 0) + 1 }));
  }), []);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const width = Math.floor(Math.min(r.width, r.height * PITCH_ASPECT));
      if (width > 100) setSize({ w: width, h: Math.floor(width / PITCH_ASPECT) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w.info !== null]);

  const ledGoal = t("match.led.goal", { name: "{name}", minute: "{minute}" });
  const pitchProps = useMemo(() => (w.info ? pitchPropsOf(w.info, w.look, ledGoal) : {}), [w.info, w.look, ledGoal]);

  if (!w.info) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 min-h-64">
        <p className="m-0 text-base text-muted-foreground">{waiting ? waitingText : w.closed ? t(`watch.closed.${w.closed}`) : t("watch.connecting")}</p>
        <Button variant="secondary" onClick={onClose}>{t("watch.leave")}</Button>
      </div>
    );
  }

  const info = w.info;
  const home = homeSideOf(info);
  const away: TeamId = home === "A" ? "B" : "A";
  const state = w.state;
  const friendScore = info.friendSide === "A"
    ? { A: info.live.score.for, B: info.live.score.against }
    : { A: info.live.score.against, B: info.live.score.for };
  const score = state?.score ?? friendScore;
  const phase = state?.matchPhase;
  const minute = state ? matchMinute(state) : info.live.minute;
  const clock = !state ? "" : phase === "halfTime" ? t("watch.half")
    : phase === "matchEnd" ? t("watch.end")
      : isLivePhase(phase!) ? `${minute + 1}'` : "";
  const live = phase !== "matchEnd" && !w.closed;

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3">
      {/* Broadcast score bar */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {live && (
            <span className="inline-flex items-center gap-1.5 font-display font-bold uppercase tracking-[0.08em] text-[13px] text-destructive">
              <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" aria-hidden="true" />
              {t("watch.live")}
            </span>
          )}
          <span className="text-sm text-muted-foreground truncate">{t("watch.watching", { name: info.nickname })}</span>
        </div>
        <div className="flex-1 flex flex-col items-center gap-0.5 min-w-0">
        <div className="w-full flex items-center justify-center gap-3 min-w-0">
          <span className={`font-display font-bold uppercase text-base truncate text-right flex-1 ${embed ? "hidden md:inline" : ""}`}>{info.teams[home].name}</span>
          <ClubLogo logoUrl={squadLogoUrl(info.teams[home].id)} className="w-8 h-8 shrink-0" imgClassName="w-full h-full object-contain" />
          <span className="font-display font-bold tabular-nums text-2xl px-3 py-0.5 rounded-md bg-card border border-border">
            {score[home]}–{score[away]}
          </span>
          <ClubLogo logoUrl={squadLogoUrl(info.teams[away].id)} className="w-8 h-8 shrink-0" imgClassName="w-full h-full object-contain" />
          <span className={`font-display font-bold uppercase text-base truncate flex-1 ${embed ? "hidden md:inline" : ""}`}>{info.teams[away].name}</span>
          <span className="text-sm text-muted-foreground tabular-nums w-16">{clock}</span>
        </div>
        <LiveCompetitionLine live={info.live} className="max-w-full text-center" />
        </div>
        <button
          type="button"
          onClick={onChat}
          className="h-9 px-2.5 inline-flex items-center gap-1.5 shrink-0 rounded-md border border-border bg-card text-sm font-semibold text-foreground hover:border-primary cursor-pointer"
          aria-label={t("watch.chat")}
          title={t("watch.chat")}
        >
          <Icon name="message-square" size={16} />
          <span className={embed ? "hidden md:inline" : ""}>{t("watch.chat")}</span>
        </button>
        <button
          type="button"
          onClick={onClose}
          hidden={embed}
          className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground"
          aria-label={t("watch.leave")}
          title={t("watch.leave")}
        >
          <Icon name="close" size={16} />
        </button>
      </div>

      <div className="flex-1 min-h-0 flex gap-3">
        <div ref={boxRef} className="flex-1 min-w-0 flex items-center justify-center relative">
          {size && state ? (
            <PixiPitch
              key={`${size.w}x${size.h}${w.look?.stadium ? `s${w.look.stadium.shape ?? ""}${w.look.stadium.depths ? Object.values(w.look.stadium.depths).join(",") : ""}` : ""}${w.look ? "l" : ""}`}
              canvasWidth={size.w}
              canvasHeight={size.h}
              keepTickerAlive
              remote={w.feed}
              initialState={state}
              mirror={info.mirror}
              extras
              staminaTeams={[]}
              coachCard={coachCard}
              {...pitchProps}
            />
          ) : (
            <span className="text-sm text-muted-foreground">{t("watch.waitingFirst")}</span>
          )}
          {w.paused && !w.closed && phase !== "matchEnd" && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-border bg-background/85 font-display font-bold uppercase tracking-[0.08em] text-base text-foreground">
                <Icon name="pause" size={16} />
                {t("watch.paused")}
              </span>
            </div>
          )}
          {w.closed && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/80">
              <p className="m-0 text-base font-semibold text-center px-4">{waiting ? waitingText : t(`watch.closed.${w.closed}`)}</p>
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={onChat}>{t("watch.chat")}</Button>
                <Button onClick={onClose}>{t("watch.leave")}</Button>
              </div>
            </div>
          )}
        </div>
        {w.live && (
          <aside className={`w-72 shrink-0 min-h-0 flex-col gap-2 border border-border rounded-md p-3 ${embed ? "hidden lg:flex" : "flex"}`}>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <LiveMoments live={w.live} />
            </div>
            <div className="shrink-0 border-t border-border pt-2 max-h-[50%] overflow-y-auto">
              <TauntActions saveId={saveId} target={{ live: seatId }} groups={liveGroups(w.live)} />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

/** The broadcast on its own page: the chat windows open here. */
function StandaloneBroadcast({ saveId, seatId, onClose, follow }: { saveId: string; seatId: string; onClose: () => void; follow: boolean }) {
  const { openChat } = useSocial();
  return <WatchBroadcast saveId={saveId} seatId={seatId} onClose={onClose} onChat={() => openChat(worldRoomParam(saveId))} follow={follow} />;
}

/** `/watch?save=…&seat=…`: the broadcast on its own page (opened in a new tab from the user's own live match). */
export function WatchScreen() {
  const target = useMemo(() => {
    const q = new URLSearchParams(window.location.search);
    const saveId = q.get("save");
    const seatId = q.get("seat");
    return saveId && seatId ? { saveId, seatId } : null;
  }, []);
  // Inside the dashboard's window (`embed=1`): closing tells the page around it.
  const embed = useMemo(() => new URLSearchParams(window.location.search).get("embed") === "1", []);
  // Own window that follows the friend (opened by the floating window's "New window").
  const follow = useMemo(() => new URLSearchParams(window.location.search).get("follow") === "1", []);
  const back = () => {
    if (embed && window.parent !== window) window.parent.postMessage({ type: "watch-close" }, window.location.origin);
    else if (follow && window.opener) window.close();
    else navigate("/dashboard");
  };
  return (
    <div className={`h-screen bg-background flex flex-col ${embed ? "p-3" : "px-6 py-4"}`}>
      {target && embed && (
        // In the frame the chat opens on the page around it, with the other chat windows of the tab.
        <WatchBroadcast
          saveId={target.saveId}
          seatId={target.seatId}
          onClose={back}
          onChat={() => window.parent.postMessage({ type: "watch-chat" }, window.location.origin)}
          embed
        />
      )}
      {target && !embed && (
        <MatchSocial>
          <StandaloneBroadcast saveId={target.saveId} seatId={target.seatId} onClose={back} follow={follow} />
        </MatchSocial>
      )}
    </div>
  );
}

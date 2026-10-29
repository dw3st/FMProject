import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PixiPitch } from "@/GraficsEngine/PixiPitch";
import { isLivePhase, matchMinute } from "@/GameEngine/Domain/gameState";
import type { GamePlayer, TeamId } from "@/GameEngine/types";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { LiveMoments } from "@/GameInterface/World/LiveMoments";
import { TitleParts } from "@/GameInterface/ui/TitleParts";
import { Button } from "@/GameInterface/ui/Button";
import { getDetailedPositionColor } from "@/GameInterface/positionHelpers";
import { useWatchSocket } from "@/GameInterface/Watch/useWatchSocket";
import type { TeamStats } from "@/GameEngine/Domain/Statistics";
import type { WatchInfo } from "@/types/watchTypes";

const PITCH_ASPECT = 1.62;

/** `?save=…&seat=…` of the page, or null. */
function targetFromUrl(): { saveId: string; seatId: string } | null {
  const q = new URLSearchParams(window.location.search);
  const saveId = q.get("save");
  const seatId = q.get("seat");
  return saveId && seatId ? { saveId, seatId } : null;
}

/** Engine team of the home side (drawn and listed on the left). */
function homeSideOf(info: WatchInfo): TeamId {
  const homeClub = info.live.home ? info.live.clubId : info.live.opponentId;
  return info.teams.A.id === homeClub ? "A" : "B";
}

/**
 * Watching a friend's live match (spec 2026-10-29-friend-match-broadcast-design): read only. The pitch is drawn from
 * the frames the friend's browser (or the server, between two managers) relays; the moments come with his live score.
 */
export function WatchScreen() {
  const { t } = useTranslation();
  const target = useMemo(targetFromUrl, []);
  const w = useWatchSocket(target);
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

  const back = () => { window.location.href = "/dashboard"; };

  if (!target) return <Notice text={t("watch.closed.refused")} onBack={back} />;
  if (!w.info) {
    return w.closed ? <Notice text={t(`watch.closed.${w.closed}`)} onBack={back} /> : <Notice text={t("watch.connecting")} />;
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
  const clock = !state ? t("watch.waitingFirst")
    : phase === "halfTime" ? t("watch.half")
      : phase === "matchEnd" ? t("watch.end")
        : isLivePhase(phase!) ? `${minute + 1}'` : "";
  const teamStats = (side: TeamId): TeamStats | undefined => w.stats?.teams[side];

  return (
    <div className="h-screen bg-background flex flex-col px-6 py-4 gap-4 overflow-hidden">
      <div className="flex items-center gap-4 flex-wrap shrink-0">
        <h1 className="font-display font-black uppercase tracking-tight text-3xl leading-none m-0">
          <TitleParts accent={info.nickname}>{t("watch.title")}</TitleParts>
        </h1>
        {phase !== "matchEnd" && !w.closed && (
          <span className="inline-flex items-center gap-1.5 font-display font-bold uppercase tracking-[0.08em] text-[13px] text-destructive">
            <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" aria-hidden="true" />
            {t("watch.live")}
          </span>
        )}
        <span className="text-sm text-muted-foreground">{t("watch.readOnly")}</span>
        <div className="ml-auto">
          <Button variant="secondary" onClick={back}>{t("watch.leave")}</Button>
        </div>
      </div>

      <div className="flex items-center justify-center gap-4 shrink-0">
        <TeamHead team={info.teams[home]} align="right" />
        <div className="text-center min-w-28">
          <div className="font-display font-bold tabular-nums text-4xl leading-none">{score[home]}–{score[away]}</div>
          <div className="text-sm text-muted-foreground tabular-nums mt-1">{clock}</div>
        </div>
        <TeamHead team={info.teams[away]} align="left" />
      </div>

      <div className="flex-1 min-h-0 flex gap-4">
        <div ref={boxRef} className="flex-1 min-w-0 flex items-center justify-center relative">
          {size && state ? (
            <PixiPitch
              key={`${size.w}x${size.h}`}
              canvasWidth={size.w}
              canvasHeight={size.h}
              keepTickerAlive
              remote={w.feed}
              initialState={state}
              mirror={info.mirror}
              teamAColor={info.teams.A.colors[0]}
              teamBColor={info.teams.B.colors[0]}
              extras
              staminaTeams={[]}
            />
          ) : (
            <span className="text-sm text-muted-foreground">{t("watch.waitingFirst")}</span>
          )}
          {w.closed && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/80">
              <p className="m-0 text-base font-semibold">{t(`watch.closed.${w.closed}`)}</p>
              <Button onClick={back}>{t("watch.leave")}</Button>
            </div>
          )}
        </div>

        <aside className="w-80 shrink-0 flex flex-col gap-4 overflow-y-auto">
          {w.live && (
            <section className="border border-border rounded-md p-3">
              <LiveMoments live={w.live} />
            </section>
          )}
          <section className="border border-border rounded-md p-3 flex flex-col gap-1.5">
            <div className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{t("watch.stats.title")}</div>
            {(["shots", "passesCompleted", "fouls", "corners", "offsides", "yellowCards", "redCards"] as const).map((k) => (
              <div key={k} className="flex items-center text-sm tabular-nums">
                <span className="w-8 text-left font-semibold">{teamStats(home)?.[k] ?? 0}</span>
                <span className="flex-1 text-center text-muted-foreground">{t(`watch.stats.${k}`)}</span>
                <span className="w-8 text-right font-semibold">{teamStats(away)?.[k] ?? 0}</span>
              </div>
            ))}
          </section>
          {state && (
            <section className="border border-border rounded-md p-3 flex flex-col gap-3">
              <div className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{t("watch.lineups")}</div>
              <Lineup title={info.teams[home].name} players={state.players.filter((p) => p.team === home)} />
              <Lineup title={info.teams[away].name} players={state.players.filter((p) => p.team === away)} />
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function TeamHead({ team, align }: { team: WatchInfo["teams"]["A"]; align: "left" | "right" }) {
  return (
    <div className={`flex items-center gap-3 flex-1 min-w-0 ${align === "right" ? "justify-end" : "justify-start"}`}>
      {align === "left" && <ClubLogo logoUrl={squadLogoUrl(team.id)} className="w-10 h-10 shrink-0" imgClassName="w-full h-full object-contain" />}
      <span className="font-display font-bold uppercase text-xl truncate">{team.name}</span>
      {align === "right" && <ClubLogo logoUrl={squadLogoUrl(team.id)} className="w-10 h-10 shrink-0" imgClassName="w-full h-full object-contain" />}
    </div>
  );
}

function Lineup({ title, players }: { title: string; players: GamePlayer[] }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-sm font-semibold truncate">{title}</div>
      {players.map((p) => (
        <div key={p.id} className="flex items-center gap-2 text-sm">
          <span className={`w-10 shrink-0 font-display font-bold text-[13px] uppercase ${getDetailedPositionColor(p.role)}`}>{p.role}</span>
          <span className="truncate flex-1">{p.name}</span>
          <span className="w-8 text-right tabular-nums text-muted-foreground">{Math.round(p.energy)}</span>
        </div>
      ))}
    </div>
  );
}

function Notice({ text, onBack }: { text: string; onBack?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="h-screen bg-background flex flex-col items-center justify-center gap-4 px-6">
      <p className="m-0 text-base text-muted-foreground">{text}</p>
      {onBack && <Button onClick={onBack}>{t("watch.leave")}</Button>}
    </div>
  );
}

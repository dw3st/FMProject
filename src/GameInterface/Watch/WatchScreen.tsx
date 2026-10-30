import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PixiPitch, type PitchLighting, type PitchOfficials, type PitchStadium } from "@/GraficsEngine/PixiPitch";
import { isLivePhase, matchMinute } from "@/GameEngine/Domain/gameState";
import type { TeamId } from "@/GameEngine/types";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { LiveMoments } from "@/GameInterface/World/LiveMoments";
import { Button } from "@/GameInterface/ui/Button";
import { Icon } from "@/GameInterface/Icons";
import { useWatchSocket } from "@/GameInterface/Watch/useWatchSocket";
import type { WatchInfo, WatchLook } from "@/types/watchTypes";

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
export function WatchBroadcast({ saveId, seatId, onClose, embed = false }: {
  saveId: string;
  seatId: string;
  onClose: () => void;
  /** Inside the floating window: it has its own close button, and a narrow window drops the side column. */
  embed?: boolean;
}) {
  const { t } = useTranslation();
  const target = useMemo(() => ({ saveId, seatId }), [saveId, seatId]);
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

  const ledGoal = t("match.led.goal", { name: "{name}", minute: "{minute}" });
  const pitchProps = useMemo(() => (w.info ? pitchPropsOf(w.info, w.look, ledGoal) : {}), [w.info, w.look, ledGoal]);

  if (!w.info) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 min-h-64">
        <p className="m-0 text-base text-muted-foreground">{w.closed ? t(`watch.closed.${w.closed}`) : t("watch.connecting")}</p>
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
        <div className="flex-1 flex items-center justify-center gap-3 min-w-0">
          <span className={`font-display font-bold uppercase text-base truncate text-right flex-1 ${embed ? "hidden md:inline" : ""}`}>{info.teams[home].name}</span>
          <ClubLogo logoUrl={squadLogoUrl(info.teams[home].id)} className="w-8 h-8 shrink-0" imgClassName="w-full h-full object-contain" />
          <span className="font-display font-bold tabular-nums text-2xl px-3 py-0.5 rounded-md bg-card border border-border">
            {score[home]}–{score[away]}
          </span>
          <ClubLogo logoUrl={squadLogoUrl(info.teams[away].id)} className="w-8 h-8 shrink-0" imgClassName="w-full h-full object-contain" />
          <span className={`font-display font-bold uppercase text-base truncate flex-1 ${embed ? "hidden md:inline" : ""}`}>{info.teams[away].name}</span>
          <span className="text-sm text-muted-foreground tabular-nums w-16">{clock}</span>
        </div>
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
              key={`${size.w}x${size.h}${w.look?.stadium ? "s" : ""}${w.look ? "l" : ""}`}
              canvasWidth={size.w}
              canvasHeight={size.h}
              keepTickerAlive
              remote={w.feed}
              initialState={state}
              mirror={info.mirror}
              extras
              staminaTeams={[]}
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
              <p className="m-0 text-base font-semibold">{t(`watch.closed.${w.closed}`)}</p>
              <Button onClick={onClose}>{t("watch.leave")}</Button>
            </div>
          )}
        </div>
        {w.live && (
          <aside className={`w-72 shrink-0 overflow-y-auto border border-border rounded-md p-3 ${embed ? "hidden lg:block" : ""}`}>
            <LiveMoments live={w.live} />
          </aside>
        )}
      </div>
    </div>
  );
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
  const back = () => {
    if (embed && window.parent !== window) window.parent.postMessage({ type: "watch-close" }, window.location.origin);
    else window.location.href = "/dashboard";
  };
  return (
    <div className={`h-screen bg-background flex flex-col ${embed ? "p-3" : "px-6 py-4"}`}>
      {target ? <WatchBroadcast saveId={target.saveId} seatId={target.seatId} onClose={back} embed={embed} /> : null}
    </div>
  );
}

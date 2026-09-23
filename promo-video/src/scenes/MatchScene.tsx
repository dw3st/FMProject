import React from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
} from "remotion";
import {
  Pause, Play, Gauge, Radio,
  ArrowRightLeft, Check, X as XIcon,
  TrendingUp, Sparkles, ArrowUp,
} from "lucide-react";
import { ClubLogo } from "@game/GameInterface/Components/ClubLogo";
import { ScreenFrame } from "../components/ScreenFrame";
import { MATCH_SNAPSHOT } from "../data/matchSnapshot";

// ─────────────────────────────────────────────────────────────────────────────
// Match scene — 5-beat narrative built around 3 real engine recordings:
//
//   1. fail.mov         Garcia gets a chance and blasts it over     (5.0s)
//   2. SubOverlay       Garcia ⇄ Mbappé substitution panel          (2.4s)
//   3. shot_miss.mov    Mbappé in position but his shot misses      (3.3s)
//   4. TrainingOverlay  Mbappé's finishing stat trains up           (2.4s)
//   5. goal.mov         Mbappé scores                               (3.5s)
//
// Total: ~18.0s. The TopNav + ScoreBar + team panels + broadcast bar persist
// across all five beats — only the pitch area swaps between videos and UI
// overlays.
// ─────────────────────────────────────────────────────────────────────────────

const eo = Easing.bezier(0.16, 1, 0.3, 1);

// Beat timing in seconds (scene-relative).
const T = {
  failStart:  0.0,
  failEnd:    5.0,
  subStart:   5.2,
  subEnd:     7.6,
  missStart:  7.8,
  missEnd:   11.1,
  trainStart:11.3,
  trainEnd:  13.7,
  goalStart: 13.9,
  goalEnd:   17.4,
  sceneEnd:  17.5,
} as const;

const HOME = {
  name: "Real Madrid",
  color: MATCH_SNAPSHOT.homeColor,
  accent: MATCH_SNAPSHOT.homeAccent,
  logo: "logos/la_liga/real_madrid.svg",
};
const AWAY = {
  name: "Barcelona",
  color: MATCH_SNAPSHOT.awayColor,
  accent: MATCH_SNAPSHOT.awayAccent,
  logo: "logos/la_liga/barcelona.svg",
};

// ─────────────────────────────────────────────────────────────────────────────

export const MatchScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  // Scene-level fade in/out.
  const fadeIn = interpolate(frame, [0, fps * 0.4], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: eo,
  });
  const fadeOut = interpolate(frame, [T.sceneEnd * fps - fps * 0.3, T.sceneEnd * fps], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Stoppage-time clock — same format the actual game uses for second-half
  // injury time: "90+X'". Builds drama by parking the match in the final
  // seconds across every beat of the narrative.
  const clockStr =
    t < T.failStart + 1.5    ? "90+1'"
    : t < T.failEnd          ? "90+2'"
    : t < T.subStart         ? "90+2'"
    : t < T.subEnd           ? "90+2'"   // game paused for sub
    : t < T.missEnd          ? "90+3'"
    : t < T.trainEnd         ? "BREAK"   // training is between-match montage
    :                          "90+3'";  // back to in-match — the last gasp

  // Score — starts at 1-1 (Barça already scored earlier in the half) and
  // Real Madrid chase the winner in stoppage time. Flips to 2-1 at the goal.
  const goalFlipped = t > T.goalStart + 2.0;
  const scoreA = goalFlipped ? 2 : 1;
  const scoreB = 1;

  // Beat-driven broadcast lines — amped for late-game drama. 1-1 in stoppage
  // time, Real Madrid chasing the winner.
  const broadcastLine =
    t < T.failStart + 1.5    ? "1-1 and time running out — Garcia driving into the area…"
    : t < T.failEnd          ? "Picks his spot for the winner…"
    : t < T.failEnd + 1.0    ? "OFF THE BAR!  GARCIA HAS MISSED IT!  Bernabéu silent…"
    : t < T.subStart         ? ""
    : t < T.subEnd           ? "MANAGER throws on MBAPPÉ — last roll of the dice at 1-1."
    : t < T.missStart + 1.5  ? "Mbappé in behind — clean through…"
    : t < T.missEnd          ? "SLICED WIDE!  He couldn't finish it!  Heads in hands…"
    : t < T.trainEnd         ? "Cut to training — Mbappé drills finishing all week."
    : t < T.goalStart + 1.4  ? "Back to the match.  Still 1-1.  Mbappé one-on-one…"
    : t < T.goalEnd - 0.5    ? "He shoots…"
    :                          "GOOOOAAAL!  MBAPPÉ!  90+3' — RM 2 — 1 BAR!  HE'S WON IT!";

  return (
    <ScreenFrame
      navActive="squad"
      todayBadge={{ label: "Live · vs Barcelona", kind: "match" }}
    >
      <AbsoluteFill style={{ opacity: fadeIn * fadeOut }}>
        <div className="absolute inset-0 px-8 py-6 grid grid-cols-[220px_1fr_220px] gap-6">
          <TeamColumn frame={frame} fps={fps} side="left"  t={t} />

          <div className="flex flex-col gap-4 items-center w-full">
            <ScoreBar
              scoreA={scoreA}
              scoreB={scoreB}
              clock={clockStr}
              urgent={clockStr.startsWith("90+")}
              scorePop={goalFlipped ? t - (T.goalStart + 2.0) : null}
              frame={frame}
            />
            <PitchArea fps={fps} />
            <Broadcast line={broadcastLine} frame={frame} fps={fps} />
            <MatchControls />
          </div>

          <TeamColumn frame={frame} fps={fps} side="right" t={t} />
        </div>
      </AbsoluteFill>
    </ScreenFrame>
  );
};

// Linear clock advance helper.
function lerpClock(t: number, t0: number, t1: number, c0: number, c1: number) {
  const k = Math.max(0, Math.min(1, (t - t0) / Math.max(0.0001, t1 - t0)));
  return c0 + (c1 - c0) * k;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pitch area — sequences each beat in absolute time.
// ─────────────────────────────────────────────────────────────────────────────

const PITCH_W = 1200;
const PITCH_H = 666;

const PitchArea: React.FC<{ fps: number }> = ({ fps }) => {
  const dur = (s0: number, s1: number) => Math.ceil((s1 - s0) * fps);
  return (
    <div
      className="relative rounded-xl overflow-hidden border-glow mx-auto bg-black"
      style={{ width: PITCH_W, height: PITCH_H }}
    >
      <Sequence from={Math.floor(T.failStart * fps)}  durationInFrames={dur(T.failStart, T.failEnd)} layout="none">
        <BeatVideo src="fail.mov"      duration={T.failEnd - T.failStart} />
      </Sequence>

      <Sequence from={Math.floor(T.subStart * fps)}   durationInFrames={dur(T.subStart, T.subEnd)} layout="none">
        <SubOverlay duration={T.subEnd - T.subStart} />
      </Sequence>

      <Sequence from={Math.floor(T.missStart * fps)}  durationInFrames={dur(T.missStart, T.missEnd)} layout="none">
        <BeatVideo src="shot_miss.mov" duration={T.missEnd - T.missStart} />
      </Sequence>

      <Sequence from={Math.floor(T.trainStart * fps)} durationInFrames={dur(T.trainStart, T.trainEnd)} layout="none">
        <TrainingOverlay duration={T.trainEnd - T.trainStart} />
      </Sequence>

      <Sequence from={Math.floor(T.goalStart * fps)}  durationInFrames={dur(T.goalStart, T.goalEnd)} layout="none">
        <BeatVideo src="goal.mov"      duration={T.goalEnd - T.goalStart} />
      </Sequence>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Beat: video clip. Each beat is a fresh <Sequence>, so frame=0 here = beat start.
// ─────────────────────────────────────────────────────────────────────────────

const BeatVideo: React.FC<{ src: string; duration: number }> = ({ src, duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = interpolate(
    frame,
    [0, fps * 0.2, duration * fps - fps * 0.2, duration * fps],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return (
    <AbsoluteFill style={{ opacity }}>
      <OffthreadVideo
        src={staticFile(src)}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        trimBefore={0}
        // Trim so we never read past video duration.
        trimAfter={Math.floor((duration + 0.05) * fps)}
        muted
      />
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Beat: substitution panel — visual matches the real SubstitutionPanel.tsx.
//
// Timeline (within the 2.4s beat):
//   0.0–0.3s : modal slides up + dims pitch
//   0.3–1.0s : Garcia row highlights red ("OUT")
//   1.0–1.7s : Mbappé row highlights green ("IN"), arrow connects them
//   1.7–2.2s : pending banner pulses "✓ Substitution made"
//   2.2–2.4s : fades out
// ─────────────────────────────────────────────────────────────────────────────

const SubOverlay: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const dimIn   = interpolate(t, [0, 0.3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: eo });
  const modalIn = interpolate(t, [0, 0.4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.34, 1.56, 0.64, 1) });
  const modalY  = interpolate(t, [0, 0.4], [40, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: eo });
  const outHi   = interpolate(t, [0.3, 0.6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: eo });
  const inHi    = interpolate(t, [0.9, 1.3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: eo });
  const arrow   = interpolate(t, [0.6, 1.2], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: eo });
  const confirm = interpolate(t, [1.5, 1.8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.34, 1.56, 0.64, 1) });
  const exit    = interpolate(t, [duration - 0.2, duration], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ opacity: exit }}>
      {/* Backdrop dim */}
      <div className="absolute inset-0 bg-black" style={{ opacity: 0.55 * dimIn }} />

      {/* Faint pitch behind so context isn't lost */}
      <AbsoluteFill style={{ opacity: 0.3 }}>
        <div className="absolute inset-0 bg-emerald-950" />
      </AbsoluteFill>

      {/* Modal */}
      <AbsoluteFill className="flex items-center justify-center" style={{ opacity: modalIn }}>
        <div
          className="bg-card border border-border rounded-2xl shadow-2xl"
          style={{ width: 760, transform: `translateY(${modalY}px)` }}
        >
          {/* Header — mirrors SubstitutionPanel.tsx */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <div className="flex items-center gap-3">
              <ArrowRightLeft className="w-5 h-5 text-primary" />
              <h2 className="text-base font-display font-black uppercase tracking-wider text-foreground m-0">
                Player Swap
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold tabular-nums text-muted-foreground">
                XI Avg <span className="text-primary glow-text">7.4</span>
                <span className="mx-1.5 text-border">·</span>
                Bench Avg <span className="text-foreground">7.0</span>
              </span>
              <span className="text-sm font-bold tabular-nums px-3 py-1 rounded-full border border-primary/40 text-primary bg-primary/10">
                4 remaining
              </span>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-border">
            <div className="flex-1 py-2.5 text-sm font-bold uppercase tracking-wider text-primary border-b-2 border-primary text-center">
              Player Swap
            </div>
            <div className="flex-1 py-2.5 text-sm font-bold uppercase tracking-wider text-muted-foreground text-center">
              Formation
            </div>
          </div>

          {/* Swap arena: two rows side by side */}
          <div className="grid grid-cols-2 gap-4 p-5">
            <div className="flex flex-col gap-2">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">On Pitch</div>
              <PlayerSubRow
                role="ST"
                name="Gonzalo García"
                rating={6.4}
                kind="out"
                highlight={outHi}
              />
            </div>
            <div className="flex flex-col gap-2">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Bench</div>
              <PlayerSubRow
                role="ST"
                name="Kylian Mbappé"
                rating={8.2}
                kind="in"
                highlight={inHi}
              />
            </div>
          </div>

          {/* Big swap arrow between the two — visible after Garcia is selected */}
          <div
            className="flex items-center justify-center pb-4"
            style={{ opacity: arrow }}
          >
            <div className="flex items-center gap-4 px-4 py-2 rounded-full bg-primary/10 border border-primary/30 glow-primary-sm">
              <span className="text-red-400 font-display font-bold text-sm">Gonzalo García</span>
              <ArrowRightLeft className="w-4 h-4 text-primary" />
              <span className="text-emerald-400 font-display font-bold text-sm">Kylian Mbappé</span>
            </div>
          </div>

          {/* Confirmation banner */}
          <div
            className="px-5 py-3 border-t border-border bg-emerald-500/10 flex items-center justify-center gap-2"
            style={{ opacity: confirm }}
          >
            <Check className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-display font-black uppercase tracking-widest text-emerald-400">
              Substitution made · 90+2'
            </span>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const PlayerSubRow: React.FC<{
  role: string;
  name: string;
  rating: number;
  kind: "in" | "out";
  highlight: number; // 0..1
}> = ({ role, name, rating, kind, highlight }) => {
  const color = kind === "out" ? "rgb(248,113,113)" : "rgb(52,211,153)"; // red-400 / emerald-400
  return (
    <div
      className="flex items-center gap-3 px-3 py-3 rounded-lg border bg-secondary/30 transition-colors"
      style={{
        borderColor: highlight > 0.1 ? `${color}` : "rgba(255,255,255,0.08)",
        background: highlight > 0.1 ? `${color}1A` : undefined,
        boxShadow: highlight > 0.5 ? `0 0 18px ${color}55` : undefined,
      }}
    >
      <span
        className="inline-flex items-center justify-center min-w-[2rem] px-1 py-0.5 rounded text-[10px] font-display font-black uppercase border shrink-0"
        style={{ color, borderColor: `${color}88`, background: `${color}1A` }}
      >
        {role}
      </span>
      <div className="flex flex-col flex-1 min-w-0">
        <span className="text-sm font-display font-bold text-foreground truncate">{name}</span>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Energy 88% · Rating {rating.toFixed(1)}
        </span>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <span
          className="text-[9px] uppercase tracking-widest font-display font-black"
          style={{ color: highlight > 0.3 ? color : "rgba(255,255,255,0.5)" }}
        >
          {kind === "out" ? "OUT" : "IN"}
        </span>
        <span
          className={
            "text-base font-display font-black tabular-nums " +
            (rating >= 8.0 ? "text-primary glow-text" : rating >= 7.0 ? "text-foreground" : "text-muted-foreground")
          }
        >
          {rating.toFixed(1)}
        </span>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Beat: Mbappé training. Finishing attribute pulses and climbs from 6.5 → 8.2.
// ─────────────────────────────────────────────────────────────────────────────

const TrainingOverlay: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const inO = interpolate(t, [0, 0.4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: eo });
  const exit = interpolate(t, [duration - 0.2, duration], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Animate finishing: 6.5 → 8.2.
  const finishing = interpolate(t, [0.5, duration - 0.4], [6.5, 8.2], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: eo,
  });

  // +1.7 SHOOTING chip pops mid-beat.
  const chipIn = interpolate(t, [1.1, 1.5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.34, 1.56, 0.64, 1),
  });

  // Other attributes — small drifts so the panel feels alive.
  const attrs = [
    { name: "Speed",        value: 9.2,        focus: "primary"   },
    { name: "Acceleration", value: 9.4,        focus: "primary"   },
    { name: "Finishing",    value: finishing,  focus: "primary",  primary: true },
    { name: "Dribbling",    value: 8.6,        focus: "primary"   },
    { name: "Vision",       value: 7.1,        focus: "secondary" },
    { name: "Passing",      value: 7.0,        focus: "secondary" },
    { name: "Strength",     value: 7.6,        focus: "secondary" },
    { name: "Stamina",      value: 8.0,        focus: "secondary" },
  ];

  return (
    <AbsoluteFill style={{ opacity: inO * exit }} className="bg-background">
      {/* Faint scanline grid for texture */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="absolute inset-0 px-10 py-8 grid grid-cols-[300px_1fr] gap-6">
        {/* Profile card */}
        <div className="card-arcade rounded-xl p-5 flex flex-col gap-4 relative">
          {/* +X.X SHOOTING chip */}
          <div
            className="absolute -top-3 right-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-display font-black uppercase tracking-wider glow-primary"
            style={{ opacity: chipIn, transform: `scale(${0.6 + chipIn * 0.4})` }}
          >
            <ArrowUp className="w-3 h-3" />
            +1.7 Shooting
          </div>

          <div className="flex flex-col items-center gap-3">
            {/* Initials avatar */}
            <div
              className="w-24 h-24 rounded-full border-glow flex items-center justify-center font-display font-black text-foreground glow-primary-sm"
              style={{
                fontSize: 40,
                background:
                  "radial-gradient(circle at 35% 30%, oklch(0.30 0.06 var(--team-hue)), oklch(0.16 0.03 var(--team-hue)))",
                border: "2px solid oklch(0.55 0.12 var(--team-hue))",
              }}
            >
              KM
            </div>
            <div className="text-center">
              <div className="font-display font-black uppercase tracking-wider text-xl text-foreground leading-tight">
                Kylian Mbappé
              </div>
              <div className="text-[11px] uppercase tracking-[0.3em] text-primary glow-text mt-2">
                Striker · 27y
              </div>
            </div>
          </div>

          <div className="h-px bg-border" />

          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Training Session · Finishing focus
          </div>
          <div className="text-xs text-muted-foreground italic leading-relaxed">
            Match-driven development — focused finishing reps lift the shooting
            attribute in a single session.
          </div>
        </div>

        {/* Attributes panel */}
        <div className="card-arcade rounded-xl p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-display font-black uppercase tracking-wider m-0 flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-primary glow-text" />
              Attributes
            </h2>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
              <Sparkles className="w-3 h-3 text-primary" />
              Live training feedback
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            {attrs.map((a) => {
              const isHero = a.primary === true;
              const heroPulse = isHero
                ? 0.4 + Math.sin((frame / fps) * 6) * 0.6
                : 0;
              const barColor = a.focus === "primary"
                ? "oklch(0.75 0.18 var(--team-hue))"
                : "oklch(0.65 0.15 240)";
              return (
                <div key={a.name} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] uppercase tracking-widest font-display font-bold text-foreground">
                      {a.name}
                    </span>
                    <span
                      className={
                        "text-sm tabular-nums font-display font-black " +
                        (isHero ? "text-primary glow-text" : "text-foreground")
                      }
                    >
                      {a.value.toFixed(1)}
                    </span>
                  </div>
                  <div className="relative h-2 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(a.value / 10) * 100}%`,
                        background: barColor,
                        boxShadow: isHero ? `0 0 ${8 + heroPulse * 18}px oklch(0.85 0.20 var(--team-hue))` : undefined,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="card-arcade border-glow rounded-lg p-3 flex items-center gap-3 mt-2">
            <div className="w-10 h-10 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <div className="text-xs uppercase tracking-widest font-display font-bold text-foreground">
                Shooting accuracy ↑
              </div>
              <div className="text-[11px] text-muted-foreground italic">
                Training paid off — Mbappé is ready to convert.
              </div>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ScoreBar / Broadcast / Controls / TeamColumn
// (TeamColumn highlights Garcia OR Mbappé as ST depending on the beat.)
// ─────────────────────────────────────────────────────────────────────────────

const ScoreBar: React.FC<{
  scoreA: number;
  scoreB: number;
  clock: string;
  urgent: boolean;
  scorePop: number | null;  // seconds since the score flipped, or null
  frame: number;
}> = ({ scoreA, scoreB, clock, urgent, scorePop, frame }) => {
  // Pulsing destructive glow on the clock when we're in stoppage time.
  const urgencyPulse = urgent ? 0.55 + Math.sin(frame * 0.22) * 0.45 : 0;

  // Score pop — burst scale + glow when the 0 flips to 1.
  const popScale = scorePop !== null
    ? 1 + Math.max(0, 0.6 - scorePop) * 1.2  // spike then settle
    : 1;
  const popGlow = scorePop !== null
    ? Math.max(0, 1.0 - scorePop) // 1 → 0 over 1.0s
    : 0;

  return (
    <div className="card-arcade rounded-xl p-4 flex items-center justify-center gap-6 w-full">
      <div className="flex items-center gap-3 flex-1 justify-end">
        <span className="font-display font-black uppercase tracking-widest text-base text-foreground">
          {HOME.name}
        </span>
        <ClubLogo
          logoUrl={staticFile(HOME.logo)}
          primaryColor={HOME.color}
          secondaryColor={HOME.accent}
          className="w-10 h-10 rounded-lg"
        />
      </div>
      <div className="flex items-center">
        <div
          className="w-14 h-14 flex items-center justify-center rounded-l-lg"
          style={{
            background: `${HOME.color}22`,
            borderLeft: `2px solid ${HOME.color}55`,
            borderTop: `1px solid ${HOME.color}33`,
            borderBottom: `1px solid ${HOME.color}33`,
            boxShadow: popGlow > 0
              ? `0 0 ${30 + popGlow * 60}px oklch(0.85 0.20 var(--team-hue) / ${popGlow})`
              : undefined,
          }}
        >
          <span
            className="text-3xl font-display font-black tabular-nums text-foreground"
            style={{
              transform: `scale(${popScale})`,
              transformOrigin: "center",
              textShadow: popGlow > 0
                ? `0 0 ${20 + popGlow * 30}px oklch(0.85 0.20 var(--team-hue))`
                : undefined,
              color: popGlow > 0 ? "oklch(0.95 0.20 var(--team-hue))" : undefined,
            }}
          >
            {scoreA}
          </span>
        </div>
        <div
          className="w-20 h-14 flex flex-col items-center justify-center bg-secondary/60 border-y"
          style={{
            borderColor: urgent
              ? `rgba(248, 113, 113, ${0.55 + urgencyPulse * 0.35})`
              : "rgba(255,255,255,0.08)",
            background: urgent
              ? `linear-gradient(180deg, rgba(248,113,113,${0.10 + urgencyPulse * 0.10}) 0%, rgba(35,12,12,0.5) 100%)`
              : undefined,
            boxShadow: urgent
              ? `0 0 ${10 + urgencyPulse * 18}px rgba(248,113,113,${0.4 + urgencyPulse * 0.3})`
              : undefined,
          }}
        >
          <span
            className="text-base font-display font-black tabular-nums"
            style={{
              color: urgent ? "rgb(248,113,113)" : undefined,
              textShadow: urgent
                ? `0 0 ${6 + urgencyPulse * 14}px rgba(248,113,113,${0.6 + urgencyPulse * 0.4})`
                : undefined,
            }}
          >
            {clock}
          </span>
          <span className="text-[9px] uppercase tracking-widest text-muted-foreground">
            La Liga · R14
          </span>
        </div>
        <div
          className="w-14 h-14 flex items-center justify-center rounded-r-lg"
          style={{
            background: `${AWAY.color}22`,
            borderRight: `2px solid ${AWAY.color}55`,
            borderTop: `1px solid ${AWAY.color}33`,
            borderBottom: `1px solid ${AWAY.color}33`,
          }}
        >
          <span className="text-3xl font-display font-black tabular-nums text-foreground">{scoreB}</span>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-1">
        <ClubLogo
          logoUrl={staticFile(AWAY.logo)}
          primaryColor={AWAY.color}
          secondaryColor={AWAY.accent}
          className="w-10 h-10 rounded-lg"
        />
        <span className="font-display font-black uppercase tracking-widest text-base text-foreground">
          {AWAY.name}
        </span>
      </div>
    </div>
  );
};


const Broadcast: React.FC<{ line: string; frame: number; fps: number }> = ({ line, frame, fps }) => {
  const o = interpolate(frame, [fps * 0.3, fps * 0.7], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: eo,
  });
  const isGoal = line.toUpperCase().includes("GOAL");
  const isMiss = line.toUpperCase().includes("OFF") || line.toUpperCase().includes("WIDE");
  const pulse = isGoal ? 0.6 + Math.sin(frame * 0.25) * 0.4 : 1;

  return (
    <div
      className="rounded-lg px-5 py-2.5 w-full flex items-center gap-4 border-t border-border bg-card/40"
      style={{
        opacity: o,
        boxShadow: isGoal
          ? `0 0 ${20 + pulse * 30}px oklch(0.75 0.18 var(--team-hue) / ${0.3 + pulse * 0.4})`
          : isMiss
            ? "0 0 20px rgba(248,113,113,0.25)"
            : undefined,
      }}
    >
      <div className="flex items-center gap-2 shrink-0">
        <Radio className={"w-4 h-4 " + (isGoal ? "text-primary glow-text" : "text-muted-foreground")} />
        <span className="text-[10px] font-display font-black text-muted-foreground uppercase tracking-[0.3em]">
          Broadcast
        </span>
      </div>
      <div
        className={
          "text-sm font-display font-bold flex-1 truncate " +
          (isGoal ? "text-primary glow-text" : isMiss ? "text-destructive" : "text-foreground")
        }
      >
        {line || <span className="text-muted-foreground italic">…</span>}
      </div>
    </div>
  );
};

const MatchControls: React.FC = () => (
  <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground w-full px-2">
    <div className="flex items-center gap-3">
      <div className="card-arcade rounded-md px-3 py-1.5 flex items-center gap-2">
        <Pause className="w-3 h-3 text-primary" /> Pause
      </div>
      <div className="card-arcade rounded-md px-3 py-1.5 flex items-center gap-2">
        <Play className="w-3 h-3 text-muted-foreground" /> 1×
      </div>
      <div className="card-arcade rounded-md px-3 py-1.5 flex items-center gap-2">
        <Gauge className="w-3 h-3 text-muted-foreground" /> 2×
      </div>
    </div>
    <div className="flex items-center gap-4">
      <span>Possession: 57% – 43%</span>
      <span>Shots: 12 – 8</span>
    </div>
  </div>
);

const TeamColumn: React.FC<{ frame: number; fps: number; side: "left" | "right"; t: number }> = ({
  frame,
  fps,
  side,
  t,
}) => {
  const isHome = side === "left";
  const o = interpolate(frame, [0, fps * 0.4], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: eo,
  });
  const tx = interpolate(frame, [0, fps * 0.4], [isHome ? -30 : 30, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: eo,
  });

  // Real Madrid lineup — swap Garcia → Mbappé at sub time.
  interface TeamRow {
    name: string;
    role: string;
    rating: number;
    justOn?: boolean;
    scorer?: boolean;
  }
  const subbedIn = t > T.subEnd;
  const homePlayers: TeamRow[] = [
    { name: "Courtois",         role: "GK",  rating: 7.4 },
    { name: "Mendy",            role: "LB",  rating: 6.9 },
    { name: "Militão",          role: "CB",  rating: 7.1 },
    { name: "Alaba",            role: "CB",  rating: 7.0 },
    { name: "Alexander-Arnold", role: "RB",  rating: 7.2 },
    { name: "Tchouaméni",       role: "CM",  rating: 7.3 },
    { name: "Valverde",         role: "CM",  rating: 7.6 },
    { name: "Bellingham",       role: "CAM", rating: 7.5 },
    { name: "Vinícius",         role: "LW",  rating: 7.9 },
    subbedIn
      ? { name: "Mbappé",         role: "ST",  rating: 8.2, justOn: true, scorer: t > T.goalStart + 2.0 }
      : { name: "Gonzalo García", role: "ST",  rating: 6.4 },
    { name: "Rodrygo",          role: "RW",  rating: 7.3 },
  ];

  const awayPlayers: TeamRow[] = [
    { name: "García",       role: "GK",  rating: 6.4 },
    { name: "Balde",        role: "LB",  rating: 6.8 },
    { name: "Cubarsí",      role: "CB",  rating: 6.6 },
    { name: "Koundé",       role: "CB",  rating: 6.7 },
    { name: "Cancelo",      role: "RB",  rating: 6.9 },
    { name: "Pedri",        role: "CM",  rating: 7.4 },
    { name: "F. de Jong",   role: "CM",  rating: 6.9 },
    { name: "Olmo",         role: "CAM", rating: 6.8 },
    { name: "Raphinha",     role: "LW",  rating: 6.7 },
    { name: "Lewandowski",  role: "ST",  rating: 6.9 },
    { name: "Yamal",        role: "RW",  rating: 7.6 },
  ];

  const players = isHome ? homePlayers : awayPlayers;
  const meta = isHome ? HOME : AWAY;

  return (
    <div
      className="card-arcade rounded-xl p-3 flex flex-col gap-1.5 overflow-hidden"
      style={{ opacity: o, transform: `translateX(${tx}px)` }}
    >
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-10 rounded" style={{ background: meta.color }} />
        <div className="flex-1 min-w-0">
          <div className="font-display font-black uppercase tracking-wider text-xs text-foreground truncate">
            {meta.name}
          </div>
          <div className="text-[9px] uppercase tracking-widest" style={{ color: meta.accent }}>
            4-3-3
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-0.5">
        {players.map((p, i) => {
          const justOnPulse = p.justOn && t < T.subEnd + 1.5
            ? 0.6 + Math.sin(frame * 0.4) * 0.4
            : 0;
          return (
            <div
              key={i}
              className={
                "flex items-center justify-between px-2 py-1 rounded text-[11px] " +
                (p.scorer ? "card-arcade border-glow" : "")
              }
              style={{
                background: justOnPulse > 0.2 ? `rgba(52,211,153,${justOnPulse * 0.18})` : undefined,
                boxShadow: justOnPulse > 0.4 ? `0 0 12px rgba(52,211,153,${justOnPulse * 0.5})` : undefined,
              }}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[8px] uppercase tracking-widest text-muted-foreground w-6 text-right">
                  {p.role}
                </span>
                <span className="font-display font-bold text-foreground truncate text-[11px]">
                  {p.name}
                </span>
                {p.scorer && <span className="text-[9px] text-primary glow-text">⚽</span>}
                {p.justOn && t < T.subEnd + 1.5 && (
                  <span className="text-[8px] text-emerald-400 font-display font-black uppercase tracking-widest">
                    IN
                  </span>
                )}
              </div>
              <span
                className={
                  "tabular-nums font-display font-black text-[11px] " +
                  (p.rating >= 8.0
                    ? "text-primary glow-text"
                    : p.rating >= 7.0
                      ? "text-foreground"
                      : "text-muted-foreground")
                }
              >
                {p.rating.toFixed(1)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

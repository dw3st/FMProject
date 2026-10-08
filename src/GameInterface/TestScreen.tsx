import { setTeamMoraleOverride } from '@/GameEngine/Configs/MoraleConfig';
import { setTeamTemperamentOverride } from '@/GameEngine/Configs/PersonalityMatchConfig';
import { MORALE } from '@/Domain/morale/moraleConfig';
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { PixiPitch, DEFAULT_DEBUG_OVERLAYS } from "@/GraficsEngine/PixiPitch";
import type { DebugOverlays, PitchPerf, PitchStadium } from "@/GraficsEngine/PixiPitch";
import { Chip } from "@/GameInterface/ui/Chip";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { DebugPanel } from "@/GameInterface/DebugPanel";
import { QuickSimPanel } from "@/GameInterface/QuickSimPanel";
import { StatsPanel } from "@/GameInterface/StatsPanel";
import { EnergyPanel } from "@/GameInterface/EnergyPanel";
import { PossessionHeatmap } from "@/GameInterface/Components/PossessionHeatmap";
import { createPossessionHeatmap, samplePossessionHeatmap, type PossessionHeatmap as HeatmapAcc } from "@/Domain/match/possessionHeatmap";
import { CrowdHeatmapPanel } from "@/GameInterface/CrowdHeatmapPanel";
import type { CrowdMode } from "@/GameEngine/Infrastructure/CrowdGrid";
import { Icon } from "@/GameInterface/Icons";
import { evaluatePoint, DEFAULT_EVAL_CONFIG } from "@/GameEngine/Infrastructure/SpatialEvaluation";
import type { EvaluationConfig, EvaluationResult } from "@/GameEngine/Infrastructure/SpatialEvaluation";
import { attackingTeam } from "@/GameEngine/Infrastructure/CrowdGrid";
import { setDebugMode, clearDebugLog } from "@/GameEngine/Support/DebugLog";
import {
  clearBroadcastLine,
  getBroadcastLine,
  onBroadcastLine,
} from "@/GameInterface/Broadcast/BroadcastLog";
import "@/GameEngine/Support/DebugSubscriber";
import "@/GameInterface/Broadcast/BroadcastSubscriber";
import { TEST_SCENARIOS } from "@/GameEngine/Support/TestCases";
import type { TestScenario } from "@/GameEngine/Support/TestCases";
import { createMatchState, getBallPos, applyTeamInstructions, setManMarksBySlot } from "@/GameEngine/Domain/gameState";
import { variantsForRole } from "@/GameEngine/Configs/RoleVariantConfig";
import { staffEffectsOf } from "@/Domain/staff/staff";
import type { Squad } from "@/types/playerTypes";

/** `/test` squads are bare rosters without finances: staff effects come from the implicit LOW-tier club. */
const staffOfTestSquad = (s: { label: string; players: Squad["players"] }) =>
  staffEffectsOf({ id: s.label, name: s.label, colors: ["#000000", "#ffffff"], money: 0, players: s.players });
import { teamLineup } from "@/GameEngine/Domain/TeamLineup";
import { getRuntimeLineup, normalizeGameState } from "@/GameEngine/Domain/RuntimeLineup";
import { gameBus, type GameEvents } from "@/GameEngine/Infrastructure/EventBus";
import { PenaltyShootoutStrip } from "@/GameInterface/Components/PenaltyShootoutStrip";
import { applyTeamTacticsConfig, getDefenseConfig } from "@/GameEngine/Configs/DefenseConfig";
import { getTeamExecutionMult } from "@/GameEngine/Configs/FamiliarityConfig";
import { applyTeamAttackConfig } from "@/GameEngine/Configs/AttackConfig";
import { DEFAULT_TACTICAL_STYLE, TACTICAL_STYLE_OPTIONS, DEFAULT_MENTALITY, MENTALITY_OPTIONS } from "@/types/tacticsTypes";
import type { TacticalStyle, Mentality, SlotInstruction, PressLevel, RoleVariantId } from "@/types/tacticsTypes";
import type { GameState, GamePlayer, Formation, TeamIntent, TeamId } from "@/GameEngine/types";
import type { PlayerDecision } from "@/GameEngine/Domain/DecisionTree";
import type { PlayerStatsRecord, RosterPlayer } from "@/types/playerTypes";
import playersJson from "@/Data/players.json";
import rolesJson from "@/Data/roles.json";
import formation433Fallback from "@/Data/formations/4-3-3.json";
import { CUSTOM_PRESETS, customToFormation } from "@/Domain/formation/zones";
import { FORMATION_IDS } from "@/Domain/matchFormations";
import type { TacticalAxes } from "@/types/tacticsTypes";
import { axesFor } from "@/types/tacticsTypes";

/** `/test` formation ids starting with "free:" are zone-grid presets (Block C2), resolved locally. */
const FREE_PREFIX = "free:";
const FREE_IDS = Object.keys(CUSTOM_PRESETS).map((k) => FREE_PREFIX + k);
function freeFormation(id: string): Formation | null {
  const preset = id.startsWith(FREE_PREFIX) ? CUSTOM_PRESETS[id.slice(FREE_PREFIX.length)] : undefined;
  return preset ? customToFormation(preset) : null;
}
const AXIS_ROWS: { key: keyof TacticalAxes; label: string; values: string[] }[] = [
  { key: "pressing_style", label: "Press", values: ["low_block", "mid_block", "high_press"] },
  { key: "defensive_line", label: "Line", values: ["deep", "normal", "high"] },
  { key: "width", label: "Width", values: ["narrow", "normal", "wide"] },
  { key: "build_up", label: "Build", values: ["direct", "balanced", "possession"] },
];
import { factorFromAptitudes } from "@/Domain/positions/positionAptitude";
import { createUiStateThrottle, isUrgentStateChange, type UiStateThrottle } from "@/GameInterface/uiStateThrottle";

// ── Constants ────────────────────────────────────────────────────────────────

/** If `/api/formations` is unreachable (wrong dev server, no Bun, etc.), still populate dropdowns. */
const FORMATION_IDS_FALLBACK = FORMATION_IDS;

const ALL_PLAYERS = playersJson as RosterPlayer[];
const TEAM_RED    = ALL_PLAYERS.filter(p => p.squadId === 'team_red');
const TEAM_BLUE   = ALL_PLAYERS.filter(p => p.squadId === 'team_blue');

const SQUADS: Record<string, { label: string; players: RosterPlayer[] }> = {
  team_red:  { label: 'Team Red',  players: TEAM_RED  },
  team_blue: { label: 'Team Blue', players: TEAM_BLUE },
};

const SPEEDS = [
  { label: '0.25×', value: 0.25 },
  { label: '0.5×',  value: 0.5  },
  { label: '1×',    value: 1    },
  { label: '2×',    value: 2    },
];

/** Familiarity values offered per team in /test (50 = neutral; `src/Domain/familiarity`). */
const FAMILIARITY_TEST_OPTIONS = [0, 25, 50, 75, 100] as const;
const MORALE_TEST_OPTIONS = [undefined, 0, 25, 50, 65, 80, 100] as const;
/** Temperament of a whole side (`personality.md`; 10.5 = neutral); undefined = each player's own. */
const TEMPERAMENT_TEST_OPTIONS = [undefined, 1, 5, 10, 15, 20] as const;

const MENTALITY_LABEL: Record<Mentality, string> = {
  attacking: 'Attack',
  balanced:  'Balanced',
  defensive: 'Defense',
};

// Pitch sizing (mirrors MatchScreen). Aspect derived from canvas-mapped pitch + margins.
const PITCH_ASPECT = 124 / 80;
const PITCH_MIN_W = 320;
const PITCH_MIN_H = Math.round(PITCH_MIN_W / PITCH_ASPECT);

function fitPitch(containerW: number, containerH: number): { w: number; h: number } | null {
  if (containerW <= 0 || containerH <= 0) return null;
  const widthFromHeight = containerH * PITCH_ASPECT;
  let w: number, h: number;
  if (widthFromHeight <= containerW) { w = widthFromHeight; h = containerH; }
  else { w = containerW; h = containerW / PITCH_ASPECT; }
  return {
    w: Math.max(PITCH_MIN_W, Math.floor(w)),
    h: Math.max(PITCH_MIN_H, Math.floor(h)),
  };
}

// ── URL params helpers ────────────────────────────────────────────────────────

const VALID_SQUADS  = new Set(Object.keys(SQUADS));
const VALID_MODES   = new Set<string>(['11v11', 'scenario']);

function urlStr(key: string): string | null {
  return new URLSearchParams(window.location.search).get(key);
}

function urlInt(key: string, min: number, max: number): number | null {
  const v = urlStr(key);
  if (v === null) return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : Math.min(max, Math.max(min, n));
}

/** Build a URL search string from a params map, omitting null/undefined values. */
function buildSearch(params: Record<string, string | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') p.set(k, v);
  }
  return p.toString() ? `?${p.toString()}` : '';
}

/** Derive a localStorage key from a URL search string so each config has its own save slot. */
function stateKeyFromSearch(search: string): string {
  const p = new URLSearchParams(search.replace(/^\?/, ''));
  const sorted = [...p.entries()].sort(([a], [b]) => a.localeCompare(b));
  const str = sorted.map(([k, v]) => `${k}=${v}`).join('&');
  return str ? `fmproject-test-state:${str}` : 'fmproject-test-state';
}

const DECISION_BADGE: Record<PlayerDecision["type"], { label: string; cls: string }> = {
  carry:                { label: "CARRY",   cls: "text-emerald-400 border-emerald-400/50" },
  shoot:                { label: "SHOOT",   cls: "text-red-400 border-red-400/50" },
  pass:                 { label: "PASS",    cls: "text-blue-400 border-blue-400/50" },
  through_ball:         { label: "TB",      cls: "text-purple-400 border-purple-400/50" },
  cross:                { label: "CROSS",   cls: "text-teal-300 border-teal-300/50" },
  long_ball:            { label: "LONG",    cls: "text-sky-400 border-sky-400/50" },
  dribble:              { label: "DRIBBLE", cls: "text-fuchsia-400 border-fuchsia-400/50" },
  tackle:               { label: "TACKLE",  cls: "text-orange-400 border-orange-400/50" },
  press:                { label: "PRESS",   cls: "text-yellow-400 border-yellow-400/50" },
  support_run:          { label: "RUN",     cls: "text-cyan-400 border-cyan-400/50" },
  create_space:         { label: "SPACE",   cls: "text-purple-400 border-purple-400/50" },
  chase_loose_ball:     { label: "CHASE",   cls: "text-amber-400 border-amber-400/50" },
  hold_shape:           { label: "SHAPE",   cls: "text-blue-400 border-blue-400/50" },
  track_mark:           { label: "MARK",    cls: "text-cyan-400 border-cyan-400/50" },
  step_into_carry_lane: { label: "STEP",    cls: "text-red-400 border-red-400/50" },
  idle:                 { label: "IDLE",    cls: "text-muted-foreground/30 border-muted-foreground/20" },
};

/** Off-ball intent → badge — shown when decision.type is `support_run`. */
type OffBallIntentKey = GameEvents['offBallScores']['intent'];
const OFF_BALL_INTENT_BADGE: Record<OffBallIntentKey, { label: string; cls: string }> = {
  offer_support: { label: "SUPPORT", cls: "text-emerald-400 border-emerald-400/50" },
  hold_space:    { label: "SHAPE",   cls: "text-violet-400 border-violet-400/50"   },
  make_run:      { label: "RUN",     cls: "text-red-400 border-red-400/50"         },
};

type RolesJson = Record<string, {
  engine:    { ballSupportScale: number; yRange: number; bounds: { minX: number; maxX: number } };
  dpWeights: Record<string, number>;
}>;

const ROLES = rolesJson as RolesJson;

const MINI_SCENARIOS = TEST_SCENARIOS.filter(s => s.id !== '11v11-classic');

/**
 * Intent override mode for the /test screen.
 *   auto             → engine decides at every possession transfer (default)
 *   balanced         → force balanced (no overlay, even after counter triggers)
 *   counter_attack   → force counter-attack offensive overlay
 *   hold_shape       → force defensive hold-shape state (low-line, passive)
 *   press_now        → force defensive press-now state (high-press override)
 */
type IntentOverride = 'auto' | TeamIntent;

const INTENT_OVERRIDE_OPTIONS: { value: IntentOverride; label: string; cls: string }[] = [
  { value: 'auto',           label: 'Auto',     cls: 'text-muted-foreground' },
  { value: 'balanced',       label: 'Balanced', cls: 'text-emerald-400' },
  { value: 'counter_attack', label: 'Counter',  cls: 'text-orange-400' },
  { value: 'switch_play',    label: 'Switch',   cls: 'text-violet-400' },
  { value: 'hold_shape',     label: 'Hold',     cls: 'text-sky-400' },
  { value: 'press_now',      label: 'Press',    cls: 'text-rose-400' },
];

const INTENT_BADGE: Record<TeamIntent, { label: string; cls: string }> = {
  balanced:       { label: 'BALANCED', cls: 'text-emerald-400 border-emerald-400/40 bg-emerald-400/10' },
  counter_attack: { label: 'COUNTER',  cls: 'text-orange-400 border-orange-400/40 bg-orange-400/10' },
  switch_play:    { label: 'SWITCH',   cls: 'text-violet-400 border-violet-400/40 bg-violet-400/10' },
  hold_shape:     { label: 'HOLD',     cls: 'text-sky-400 border-sky-400/40 bg-sky-400/10' },
  press_now:      { label: 'PRESS',    cls: 'text-rose-400 border-rose-400/40 bg-rose-400/10' },
};

// ── Attr override helper ───────────────────────────────────────────────────

function applyAttrOverride(players: GamePlayer[], a: number, b: number): GamePlayer[] {
  return players.map(p => {
    const v = p.team === 'A' ? a : b;
    const raw: PlayerStatsRecord = {
      passing: v, vision: v, finishing: v, dribbling: v,
      pressing: v, tackling: v, speed: v, acceleration: v,
      stamina: v, heading: v, strength: v, reflex: v, jump: v,
    };
    const baseStats = teamLineup(raw, p.role);
    const energy = 100;
    return {
      ...p,
      baseStats,
      stamina: raw.stamina,
      energy,
      runtimeStats: getRuntimeLineup(baseStats, { energy }),
    };
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PlayerRow({
  player, decision, offBallIntent, isHolder, isSelected, onClick,
}: {
  player:        GamePlayer;
  decision?:     PlayerDecision;
  offBallIntent?: OffBallIntentKey;
  isHolder:      boolean;
  isSelected:    boolean;
  onClick:       (p: GamePlayer) => void;
}) {
  // For support_run we substitute the actual off-ball intent badge so the row
  // can distinguish offer_support / hold_space / make_run instead of always "RUN".
  const badge = decision
    ? (decision.type === 'support_run' && offBallIntent
        ? OFF_BALL_INTENT_BADGE[offBallIntent]
        : DECISION_BADGE[decision.type])
    : null;
  const dot   = player.team === 'A' ? 'bg-blue-500' : 'bg-red-500';
  const fitK  = factorFromAptitudes(player.fit?.aptitudes, player.role);
  return (
    <button
      onClick={() => onClick(player)}
      className={`w-full flex items-center gap-1.5 px-2.5 py-1.5 border-b border-border/30 text-left cursor-pointer transition-colors ${
        isSelected
          ? 'bg-primary/15 border-l-2 border-primary'
          : isHolder
          ? 'bg-secondary/40'
          : 'hover:bg-secondary/20'
      }`}
    >
      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      <span className="w-7 text-[9px] font-bold text-muted-foreground uppercase shrink-0">{player.role}</span>
      <span className="w-7 text-[9px] font-mono tabular-nums text-amber-400/90 shrink-0" title="Energy">
        {typeof player.energy === "number" ? Math.round(player.energy) : "—"}
      </span>
      <span className="flex-1 text-xs font-medium text-foreground truncate">{player.name}</span>
      {fitK < 1 && (
        <span
          className={`font-mono tabular-nums text-[9px] shrink-0 ${fitK < 0.9 ? 'text-destructive' : 'text-amber-400'}`}
          title={`Out of position: attributes x${fitK.toFixed(2)} at ${player.role}`}
        >
          x{fitK.toFixed(2)}
        </span>
      )}
      {badge && (
        <span className={`px-1 py-0.5 rounded text-[8px] font-bold uppercase border ${badge.cls}`}>
          {badge.label}
        </span>
      )}
    </button>
  );
}

function TeamList({
  team, players, decisions, offBallIntents, ballHolderId, selectedId, onSelect,
}: {
  team:           'A' | 'B';
  players:        GamePlayer[];
  decisions:      Record<number, PlayerDecision>;
  offBallIntents: Record<number, OffBallIntentKey>;
  ballHolderId:   number;
  selectedId:     number | null;
  onSelect:       (p: GamePlayer) => void;
}) {
  const label     = team === 'A' ? 'Team A' : 'Team B';
  const labelCls  = team === 'A' ? 'text-blue-400' : 'text-red-400';
  return (
    <div className="w-[13.5rem] shrink-0 card-arcade rounded-xl overflow-hidden flex flex-col self-stretch">
      <div className={`px-3 py-2 border-b border-border text-[10px] font-bold uppercase tracking-widest ${labelCls}`}>
        {label}
      </div>
      <div className="flex-1 overflow-y-auto">
        {players.map(p => (
          <PlayerRow
            key={p.id}
            player={p}
            decision={decisions[p.id]}
            offBallIntent={offBallIntents[p.id]}
            isHolder={p.id === ballHolderId}
            isSelected={p.id === selectedId}
            onClick={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground tabular-nums">
        {typeof value === 'number' ? value.toFixed(2) : value}
      </span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type Mode = '11v11' | 'scenario';

type CrowdFillKey = "0" | "25" | "50" | "default" | "75" | "100";
const CROWD_FILLS: Record<CrowdFillKey, number> = { "0": 0, "25": 0.25, "50": 0.5, default: 0.65, "75": 0.75, "100": 1 };
const CROWD_FILL_OPTIONS: { key: CrowdFillKey; label: string }[] = [
  { key: "0", label: "0%" }, { key: "25", label: "25%" }, { key: "50", label: "50%" },
  { key: "default", label: "Default" }, { key: "75", label: "75%" }, { key: "100", label: "100%" },
];
const TEST_COACHES = { A: { color: "#2d6cdf" }, B: { color: "#df3b2d" } } as const;

export function TestScreen() {
  const [mode, setMode]           = useState<Mode>(() => {
    const v = urlStr('mode'); return VALID_MODES.has(v ?? '') ? (v as Mode) : '11v11';
  });
  const [squadA, setSquadA]       = useState(() => { const v = urlStr('Asquad'); return VALID_SQUADS.has(v ?? '') ? v! : 'team_red'; });
  const [squadB, setSquadB]       = useState(() => { const v = urlStr('Bsquad'); return VALID_SQUADS.has(v ?? '') ? v! : 'team_blue'; });
  const [formations, setFormations] = useState<string[]>([]);
  const [formIdA, setFormIdA]     = useState(() => urlStr('Aform') ?? '4-3-3');
  const [formIdB, setFormIdB]     = useState(() => urlStr('Bform') ?? '4-3-3');
  const [formObjA, setFormObjA]   = useState<Formation | null>(null);
  const [formObjB, setFormObjB]   = useState<Formation | null>(null);
  const [tacticsA, setTacticsA]   = useState<TacticalStyle>(() => {
    const v = urlStr('Atac'); return (TACTICAL_STYLE_OPTIONS.some(o => o.value === v) ? v : DEFAULT_TACTICAL_STYLE) as TacticalStyle;
  });
  const [tacticsB, setTacticsB]   = useState<TacticalStyle>(() => {
    const v = urlStr('Btac'); return (TACTICAL_STYLE_OPTIONS.some(o => o.value === v) ? v : DEFAULT_TACTICAL_STYLE) as TacticalStyle;
  });
  // Live-match mentality shift per team (spec §1) — layered on top of the tactical style.
  const [axesA, setAxesA] = useState<Partial<TacticalAxes> | undefined>(undefined);
  const [axesB, setAxesB] = useState<Partial<TacticalAxes> | undefined>(undefined);
  const [mentalityA, setMentalityA] = useState<Mentality>(() => {
    const v = urlStr('Amen'); return (MENTALITY_OPTIONS as string[]).includes(v ?? '') ? (v as Mentality) : DEFAULT_MENTALITY;
  });
  const [mentalityB, setMentalityB] = useState<Mentality>(() => {
    const v = urlStr('Bmen'); return (MENTALITY_OPTIONS as string[]).includes(v ?? '') ? (v as Mentality) : DEFAULT_MENTALITY;
  });
  // Style familiarity per team (`src/Domain/familiarity`): 50 = neutral, applied to the team's own style.
  const [famA, setFamA] = useState<number>(50);
  const [famB, setFamB] = useState<number>(50);
  // Morale of each whole side (`.claude/rules/game/morale.md`; 65 = neutral), applied at build time.
  // `undefined` = "Roster": every player at his own stored morale (the per-player path of a real match).
  const [moraleA, setMoraleA] = useState<number | undefined>(undefined);
  const [moraleB, setMoraleB] = useState<number | undefined>(undefined);
  // Temperament of each whole side (`personality.md`): fouls and cards; undefined = each player's own.
  const [tempA, setTempA] = useState<number | undefined>(undefined);
  const [tempB, setTempB] = useState<number | undefined>(undefined);
  // Intent overrides — 'auto' lets the engine decide on possession transfer;
  // a fixed value force-pins the team's intent every tick so we can study its effect.
  // Player instructions per team (`player-instructions.md`): slot variants / pressing, man-marking.
  const [instr, setInstr] = useState<Record<TeamId, (SlotInstruction | null)[]>>({ A: [], B: [] });
  const [manMarks, setManMarksUi] = useState<Record<TeamId, { slot: number; targetSlot: number }[]>>({ A: [], B: [] });
  const instrRef = useRef(instr);
  const manMarksRef = useRef(manMarks);
  instrRef.current = instr;
  manMarksRef.current = manMarks;
  const [intentOverrideA, setIntentOverrideA] = useState<IntentOverride>('auto');
  const [intentOverrideB, setIntentOverrideB] = useState<IntentOverride>('auto');
  // Live readout of the engine's per-team intent. Updated from teamIntentChanged
  // and stateChanged so the badge stays accurate even after manual overrides.
  const [liveTeamIntent, setLiveTeamIntent] = useState<{ A: TeamIntent; B: TeamIntent }>({ A: 'balanced', B: 'balanced' });
  const [matchState, setMatchState] = useState<GameState | null>(null);
  /** Throttle of the live panels (stateChanged effect below); cancelled when a scenario/squad reset rebuilds the state. */
  const uiThrottleRef = useRef<UiStateThrottle<GameState> | null>(null);
  const [scenario, setScenario]   = useState<TestScenario>(() => {
    const id = urlStr('scene'); return MINI_SCENARIOS.find(s => s.id === id) ?? MINI_SCENARIOS[0]!;
  });
  const [scenarioState, setScenarioState] = useState<GameState | null>(null);
  const [resetKey, setResetKey]   = useState(0);
  const [paused, setPaused]       = useState(false);
  const [speed, setSpeed]         = useState(1);
  /** Draw-time meter: filled by the pitch every 30 frames, read once a second. */
  const pitchPerfRef = useRef<PitchPerf | null>(null);
  const [pitchPerf, setPitchPerf] = useState<PitchPerf | null>(null);
  // Stadium / officials (spec 2026-10-08-match-visual §9): off by default so the tuning scenarios keep their scale.
  const [stadiumOn, setStadiumOn] = useState(false);
  const [officialsOn, setOfficialsOn] = useState(false);
  const [crowdFill, setCrowdFill] = useState<CrowdFillKey>("default");
  const [neutralVenue, setNeutralVenue] = useState(false);
  const pitchStadium = useMemo<PitchStadium | null>(
    () => (stadiumOn ? { fill: CROWD_FILLS[crowdFill], homeTeam: "A", neutral: neutralVenue, seed: "test" } : null),
    [stadiumOn, crowdFill, neutralVenue],
  );
  useEffect(() => {
    const id = setInterval(() => setPitchPerf(pitchPerfRef.current ? { ...pitchPerfRef.current } : null), 1000);
    return () => clearInterval(id);
  }, []);
  const [debug, setDebug]         = useState(true);
  const [quickSimOpen, setQuickSimOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [energyOpen, setEnergyOpen] = useState(false);
  /** Optional possession heat map (Etapa 35): filled on every emitted state, reset with the match. */
  const [heatmapOpen, setHeatmapOpen] = useState(false);
  const heatmapRef = useRef<HeatmapAcc | null>(createPossessionHeatmap());
  const [broadcastLine, setBroadcastLine] = useState(() => getBroadcastLine());
  const [debugOverlays, setDebugOverlays] = useState<DebugOverlays>(() => {
    try {
      const s = localStorage.getItem('fmproject-debug-overlays');
      return s ? { ...DEFAULT_DEBUG_OVERLAYS, ...JSON.parse(s) as Partial<DebugOverlays> } : DEFAULT_DEBUG_OVERLAYS;
    } catch { return DEFAULT_DEBUG_OVERLAYS; }
  });

  // ── Crowd overlay state ─────────────────────────────────────────────────
  const [crowdEnabled, setCrowdEnabled] = useState<boolean>(() => {
    try {
      const s = localStorage.getItem('fmproject-crowd-enabled');
      return s === 'true';
    } catch { return false; }
  });
  const [crowdMode, setCrowdMode] = useState<CrowdMode>(() => {
    try {
      const s = localStorage.getItem('fmproject-crowd-mode');
      return s === 'attack' || s === 'defense' || s === 'crowd' ? s : 'crowd';
    } catch { return 'crowd'; }
  });
  const [evalConfig, setEvalConfig] = useState<EvaluationConfig>(() => {
    try {
      const s = localStorage.getItem('fmproject-crowd-eval-config');
      return s ? { ...DEFAULT_EVAL_CONFIG, ...JSON.parse(s) as Partial<EvaluationConfig> } : DEFAULT_EVAL_CONFIG;
    } catch { return DEFAULT_EVAL_CONFIG; }
  });
  const [evalResult, setEvalResult] = useState<EvaluationResult | null>(null);
  const [pitchClickPos, setPitchClickPos] = useState<{ x: number; y: number } | null>(null);
  const evalConfigRef = useRef(evalConfig);
  useEffect(() => { evalConfigRef.current = evalConfig; }, [evalConfig]);
  const pitchClickPosRef = useRef(pitchClickPos);
  useEffect(() => { pitchClickPosRef.current = pitchClickPos; }, [pitchClickPos]);

  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);
  const [playerList, setPlayerList]             = useState<GamePlayer[]>([]);
  const [liveDecisions, setLiveDecisions]       = useState<Record<number, PlayerDecision>>({});
  const [liveOffBallIntents, setLiveOffBallIntents] = useState<Record<number, OffBallIntentKey>>({});
  const [liveBallHolder, setLiveBallHolder]     = useState<number>(-1);
  const [liveGameState, setLiveGameState]       = useState<GameState | null>(null);
  const liveStateRef = useRef<GameState | null>(null);
  const [livePlayer, setLivePlayer] = useState<GamePlayer | null>(null);
  const lastDefensiveScoresRef = useRef<Record<number, unknown>>({});
  const lastOffBallScoresRef   = useRef<Record<number, unknown>>({});
  const pitchCaptureRef        = useRef<(() => Promise<string | null>) | null>(null);

  // ── URL-keyed save/load ───────────────────────────────────────────────────
  // urlSearch mirrors window.location.search and is updated whenever config changes.
  // All save/load operations key off this so each URL config has its own slot.
  const [urlSearch, setUrlSearch] = useState(() => window.location.search);
  const [saveCounter, setSaveCounter] = useState(0);
  const [phaseCountdown, setPhaseCountdown] = useState<{ target: 'halfTime' | 'matchEnd'; remaining: number } | null>(null);

  // ── Pitch sizing (responsive — mirrors MatchScreen) ───────────────────────
  // Two-phase render: layout paints first with a loader in the host slot, then we measure on the
  // next animation frame and mount PixiPitch with the measured size. ResizeObserver is avoided —
  // it can fire during PixiPitch's own layout reflow and create a remount feedback loop.
  const [pitchSize, setPitchSize] = useState<{ w: number; h: number } | null>(null);
  const pitchHostElRef = useRef<HTMLDivElement | null>(null);
  const measurePitch = useCallback(() => {
    const host = pitchHostElRef.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const next = fitPitch(rect.width, rect.height);
    if (!next) return;
    setPitchSize(prev => (prev && prev.w === next.w && prev.h === next.h ? prev : next));
  }, []);
  const pitchHostRef = useCallback(
    (host: HTMLDivElement | null) => {
      pitchHostElRef.current = host;
      if (host) requestAnimationFrame(measurePitch);
    },
    [measurePitch],
  );
  useEffect(() => {
    window.addEventListener('resize', measurePitch);
    return () => window.removeEventListener('resize', measurePitch);
  }, [measurePitch]);

  // ── Persisted state (save/load) ───────────────────────────────────────────
  const [loadedState, setLoadedState] = useState<GameState | null>(() => {
    try {
      const key = stateKeyFromSearch(window.location.search);
      const s = localStorage.getItem(key);
      return s ? JSON.parse(s) as GameState : null;
    } catch { return null; }
  });
  const [loadKey, setLoadKey] = useState(0);

  // ── Per-team attr override (test sliders) ─────────────────────────────────
  const [attrA, setAttrA] = useState(() => urlInt('Aattr', 1, 10) ?? 10);
  const [attrB, setAttrB] = useState(() => urlInt('Battr', 1, 10) ?? 10);
  const attrARef = useRef(attrA);
  const attrBRef = useRef(attrB);
  useEffect(() => { attrARef.current = attrA; }, [attrA]);
  useEffect(() => { attrBRef.current = attrB; }, [attrB]);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    // If a saved state was restored from localStorage on mount, populate playerList
    if (loadedState) setPlayerList(loadedState.players);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => onBroadcastLine(setBroadcastLine), []);

  useEffect(() => {
    setDebugMode(true);
    fetch("/api/formations")
      .then(r => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<{ id: string }[]>;
      })
      .then(list => setFormations([...list.map(f => f.id), ...FREE_IDS]))
      .catch(() => {
        console.warn(
          "[Test] /api/formations failed — open this app via `bun dev` (same origin as the API). Using bundled formation list.",
        );
        setFormations([...FORMATION_IDS_FALLBACK, ...FREE_IDS]);
      });
  }, []);

  useEffect(() => {
    const free = freeFormation(formIdA);
    if (free) { setFormObjA(free); return; }
    fetch(`/api/formations/${formIdA}`)
      .then(r => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<Formation>;
      })
      .then(setFormObjA)
      .catch(() => setFormObjA(formation433Fallback as Formation));
  }, [formIdA]);

  useEffect(() => {
    const free = freeFormation(formIdB);
    if (free) { setFormObjB(free); return; }
    fetch(`/api/formations/${formIdB}`)
      .then(r => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<Formation>;
      })
      .then(setFormObjB)
      .catch(() => setFormObjB(formation433Fallback as Formation));
  }, [formIdB]);

  // Tactics (incl. style familiarity) are applied BEFORE the match state is built: familiarity
  // also scales the team's attributes at build time (`FamiliarityConfig.ts` → execution).
  useEffect(() => { const f = { [tacticsA]: famA }; applyTeamTacticsConfig('A', tacticsA, mentalityA, axesA, f); applyTeamAttackConfig('A', tacticsA, mentalityA, axesA, f); gameBus.emit('tacticsChanged', { team: 'A' }); }, [tacticsA, mentalityA, axesA, famA]);
  useEffect(() => { const f = { [tacticsB]: famB }; applyTeamTacticsConfig('B', tacticsB, mentalityB, axesB, f); applyTeamAttackConfig('B', tacticsB, mentalityB, axesB, f); gameBus.emit('tacticsChanged', { team: 'B' }); }, [tacticsB, mentalityB, axesB, famB]);

  useEffect(() => {
    if (!formObjA || !formObjB) return;
    setTeamMoraleOverride('A', moraleA);
    setTeamMoraleOverride('B', moraleB);
    setTeamTemperamentOverride('A', tempA);
    setTeamTemperamentOverride('B', tempB);
    const base = createMatchState(SQUADS[squadA]!.players, formObjA, SQUADS[squadB]!.players, formObjB, undefined, undefined, {
      A: staffOfTestSquad(SQUADS[squadA]!).injuryMult,
      B: staffOfTestSquad(SQUADS[squadB]!).injuryMult,
    });
    let state: GameState = { ...base, testMode: true, players: applyAttrOverride(base.players, attrARef.current, attrBRef.current) };
    for (const team of ['A', 'B'] as const) {
      state = applyTeamInstructions(state, team, instrRef.current[team]);
      state = setManMarksBySlot(state, team, manMarksRef.current[team]);
    }
    uiThrottleRef.current?.cancel(); // a pending delivery would bring the old match back
    heatmapRef.current = createPossessionHeatmap();
    setMatchState(state);
    setPlayerList(state.players);
    setSelectedPlayerId(null);
    setLivePlayer(null);
    setLiveGameState(null); // clear stale state so sidebar uses the new playerList immediately
  }, [squadA, squadB, formObjA, formObjB, famA, famB, moraleA, moraleB, tempA, tempB]);

  useEffect(() => {
    setTeamMoraleOverride('A', moraleA);
    setTeamMoraleOverride('B', moraleB);
    setTeamTemperamentOverride('A', tempA);
    setTeamTemperamentOverride('B', tempB);
    const base = scenario.createState();
    const state = { ...base, testMode: true, players: applyAttrOverride(base.players, attrARef.current, attrBRef.current) };
    uiThrottleRef.current?.cancel(); // a pending delivery would bring the old scenario back
    heatmapRef.current = createPossessionHeatmap();
    setScenarioState(state);
    setPlayerList(state.players);
    setSelectedPlayerId(null);
    setLivePlayer(null);
  }, [scenario, resetKey]);

  // A familiarity change rebuilds the scenario state (familiarity scales attributes at build time),
  // but only in scenario mode: in 11v11 mode the squad effect above already rebuilds, and the
  // scenario players must not overwrite its player list.
  const famInitRef = useRef(true);
  useEffect(() => {
    if (famInitRef.current) { famInitRef.current = false; return; }
    if (mode !== 'scenario') return;
    setTeamMoraleOverride('A', moraleA);
    setTeamMoraleOverride('B', moraleB);
    setTeamTemperamentOverride('A', tempA);
    setTeamTemperamentOverride('B', tempB);
    const base = scenario.createState();
    const state = { ...base, testMode: true, players: applyAttrOverride(base.players, attrARef.current, attrBRef.current) };
    uiThrottleRef.current?.cancel(); // a pending delivery would bring the old scenario back
    heatmapRef.current = createPossessionHeatmap();
    setScenarioState(state);
    setPlayerList(state.players);
  }, [famA, famB, moraleA, moraleB, tempA, tempB]); // eslint-disable-line react-hooks/exhaustive-deps


  // When attr sliders change, patch live player stats immediately
  useEffect(() => {
    const s = liveStateRef.current;
    if (!s) return;
    const players = applyAttrOverride(s.players, attrA, attrB);
    gameBus.emit('testCommand', { type: 'patchPlayers', players });
    setPlayerList(players);
  }, [attrA, attrB]); // eslint-disable-line react-hooks/exhaustive-deps

  // The pitch emits every simulated frame; the ref and `setLiveBallHolder` follow every emission (outside the
  // throttle, so a new ball holder re-pins the intent override below without delay), the other React panels at
  // most every UI_STATE_INTERVAL_MS (spec 2026-10-06 §2), at once on a phase/score change and while paused
  // (commands).
  useEffect(() => {
    const throttle = createUiStateThrottle<GameState>({
      isUrgent: isUrgentStateChange,
      deliver: s => {
        setLiveDecisions(s.decisions);
        setLiveGameState(s);
        if (s.teamIntent) setLiveTeamIntent(s.teamIntent);
        const selected = selectedPlayerIdRef.current;
        if (selected !== null) {
          const p = s.players.find(pl => pl.id === selected) ?? null;
          setLivePlayer(p);
        }
        // Live re-evaluate the parked click — keeps the panel in sync
        // as players move (also useful when this gets wired into engine systems).
        const pos = pitchClickPosRef.current;
        if (pos) {
          setEvalResult(evaluatePoint(s, pos.x, pos.y, evalConfigRef.current));
        }
      },
    });
    uiThrottleRef.current = throttle;
    const off = gameBus.on('stateChanged', s => {
      liveStateRef.current = s;
      if (heatmapRef.current) samplePossessionHeatmap(heatmapRef.current, s);
      setLiveBallHolder(s.ballHolderId);
      throttle.push(s, pausedRef.current);
    });
    return () => {
      off();
      throttle.cancel();
      uiThrottleRef.current = null;
    };
  }, []);

  // Track engine-side intent changes (counter-attack triggered, possession reset, etc.)
  useEffect(() => gameBus.on('teamIntentChanged', e => {
    setLiveTeamIntent(e.teamIntent);
  }), []);

  // Re-pin team intent on the engine every time the override (or possession) changes.
  // 'auto' is a no-op — the engine's possession-gain detection stays in charge.
  useEffect(() => {
    if (intentOverrideA !== 'auto') {
      gameBus.emit('testCommand', { type: 'setTeamIntent', team: 'A', intent: intentOverrideA });
    }
  }, [intentOverrideA, liveBallHolder]);
  useEffect(() => {
    if (intentOverrideB !== 'auto') {
      gameBus.emit('testCommand', { type: 'setTeamIntent', team: 'B', intent: intentOverrideB });
    }
  }, [intentOverrideB, liveBallHolder]);

  useEffect(() => gameBus.on('defensiveScores', e => {
    lastDefensiveScoresRef.current[e.playerId] = e;
  }), []);

  useEffect(() => gameBus.on('offBallScores', e => {
    lastOffBallScoresRef.current[e.playerId] = e;
    setLiveOffBallIntents(prev =>
      prev[e.playerId] === e.intent ? prev : { ...prev, [e.playerId]: e.intent }
    );
  }), []);

  // ── Sync config state → URL ───────────────────────────────────────────────
  useEffect(() => {
    const search = buildSearch({
      mode:   mode !== '11v11' ? mode : null,
      Asquad: squadA !== 'team_red'  ? squadA : null,
      Bsquad: squadB !== 'team_blue' ? squadB : null,
      Aform:  formIdA !== '4-3-3' ? formIdA : null,
      Bform:  formIdB !== '4-3-3' ? formIdB : null,
      Atac:   tacticsA !== DEFAULT_TACTICAL_STYLE ? tacticsA : null,
      Btac:   tacticsB !== DEFAULT_TACTICAL_STYLE ? tacticsB : null,
      Amen:   mentalityA !== DEFAULT_MENTALITY ? mentalityA : null,
      Bmen:   mentalityB !== DEFAULT_MENTALITY ? mentalityB : null,
      Aattr:  attrA !== 10 ? String(attrA) : null,
      Battr:  attrB !== 10 ? String(attrB) : null,
      scene:  mode === 'scenario' && scenario.id !== MINI_SCENARIOS[0]?.id ? scenario.id : null,
    });
    history.replaceState(null, '', search || window.location.pathname);
    setUrlSearch(search);
  }, [mode, squadA, squadB, formIdA, formIdB, tacticsA, tacticsB, mentalityA, mentalityB, attrA, attrB, scenario]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Phase trigger countdown ───────────────────────────────────────────────
  useEffect(() => {
    if (!phaseCountdown) return;
    if (phaseCountdown.remaining <= 0) {
      gameBus.emit('testCommand', { type: 'triggerPhase', phase: phaseCountdown.target });
      setPhaseCountdown(null);
      return;
    }
    const t = setTimeout(() => setPhaseCountdown(c => c ? { ...c, remaining: c.remaining - 1 } : null), 1000);
    return () => clearTimeout(t);
  }, [phaseCountdown]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setLoadedState(null);
    setResetKey(k => k + 1);
    setPaused(false);
    clearDebugLog();
    clearBroadcastLine();
    setSelectedPlayerId(null);
    setLivePlayer(null);
    if (mode === 'scenario') setScenarioState(scenario.createState());
  }, [mode, scenario]);

  const handleSave = useCallback(() => {
    const s = liveStateRef.current;
    if (!s) return;
    localStorage.setItem(stateKeyFromSearch(window.location.search), JSON.stringify(s));
    setSaveCounter(c => c + 1);
  }, []);

  const handleSaveDebug = useCallback(async () => {
    const s = liveStateRef.current;
    if (!s) return;

    const holder = s.players.find(p => p.id === s.ballHolderId);

    const snapshot = {
      timestamp: new Date().toISOString(),
      ballHolder: holder ? { id: holder.id, name: holder.name, team: holder.team, x: holder.x, y: holder.y, role: holder.role } : null,
      ball: getBallPos(s),
      score: s.score,
      matchTime: s.matchTime,
      players: s.players.map(p => ({
        id:         p.id,
        name:       p.name,
        team:       p.team,
        role:       p.role,
        x:          p.x,
        y:          p.y,
        attackDir:  p.attackDir,
        decision:   s.decisions[p.id] ?? null,
        defensiveScores: lastDefensiveScoresRef.current[p.id] ?? null,
        offBallScores:   lastOffBallScoresRef.current[p.id]   ?? null,
        stats: {
          withBall:    p.runtimeStats.withBall,
          withoutBall: p.runtimeStats.withoutBall,
        },
        bounds: p.bounds,
      })),
      rawState: s,
    };

    const image = pitchCaptureRef.current ? await pitchCaptureRef.current() : null;

    try {
      const res = await fetch('/api/debug/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...snapshot, image }),
      });
      const { file, imageFile } = await res.json() as { file: string; imageFile?: string };
      console.info(`[debug] snapshot saved → ${file}${imageFile ? ` (+ ${imageFile})` : ''}`);
    } catch (e) {
      console.error('[debug] failed to save snapshot', e);
    }
  }, []);

  const handleLoad = useCallback(() => {
    try {
      const raw = localStorage.getItem(stateKeyFromSearch(window.location.search));
      if (!raw) return;
      const state = normalizeGameState(JSON.parse(raw) as GameState);
      setLoadedState(state);
      setPlayerList(state.players);
      setLoadKey(k => k + 1);
      setSelectedPlayerId(null);
      setLivePlayer(null);
    } catch { /* ignore corrupt data */ }
  }, []);

  const toggleOverlay = useCallback((key: keyof DebugOverlays) => {
    setDebugOverlays(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem('fmproject-debug-overlays', JSON.stringify(next));
      return next;
    });
  }, []);

  const toggleCrowdOverlay = useCallback(() => {
    setCrowdEnabled(prev => {
      const next = !prev;
      localStorage.setItem('fmproject-crowd-enabled', String(next));
      return next;
    });
  }, []);

  const handleCrowdModeChange = useCallback((m: CrowdMode) => {
    setCrowdMode(m);
    localStorage.setItem('fmproject-crowd-mode', m);
  }, []);

  const handleEvalConfigChange = useCallback((next: EvaluationConfig) => {
    setEvalConfig(next);
    localStorage.setItem('fmproject-crowd-eval-config', JSON.stringify(next));
    // Recompute immediately so sliders update the panel without re-clicking.
    const s = liveStateRef.current;
    const pos = pitchClickPosRef.current;
    if (s && pos) setEvalResult(evaluatePoint(s, pos.x, pos.y, next));
  }, []);

  const handlePitchClick = useCallback((x: number, y: number) => {
    setPitchClickPos({ x, y });
    const s = liveStateRef.current;
    if (!s) return;
    setEvalResult(evaluatePoint(s, x, y, evalConfigRef.current));
  }, []);

  const handleClearPitchClick = useCallback(() => {
    setPitchClickPos(null);
    setEvalResult(null);
  }, []);

  const handlePlayerClick = useCallback((player: GamePlayer) => {
    setSelectedPlayerId(player.id);
    const live = liveStateRef.current?.players.find(p => p.id === player.id) ?? player;
    setLivePlayer(live);
  }, []);

  const selectScenario = useCallback((s: TestScenario) => {
    setScenario(s);
    setResetKey(k => k + 1);
    setPaused(false);
    clearDebugLog();
    clearBroadcastLine();
    setSelectedPlayerId(null);
    setLivePlayer(null);
  }, []);

  // Stable refs so keybind handler never re-registers on state changes
  const selectedPlayerIdRef = useRef(selectedPlayerId);
  useEffect(() => { selectedPlayerIdRef.current = selectedPlayerId; }, [selectedPlayerId]);
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
    if (paused) uiThrottleRef.current?.flush();
  }, [paused]);

  // ── Keybinds ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const SPEED_MAP: Record<string, number> = { '1': 0.25, '2': 0.5, '3': 1, '4': 2 };
    const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === ' ') { e.preventDefault(); setPaused(p => !p); return; }
      if (e.key === 'd' || e.key === 'D') { setDebug(d => { setDebugMode(!d); return !d; }); return; }
      if (SPEED_MAP[e.key] !== undefined) { setSpeed(SPEED_MAP[e.key]!); return; }

      // Arrow — move selected player (paused only). Shift = fine 0.25 yd, normal = 1 yd
      if (ARROWS.includes(e.key)) {
        e.preventDefault();
        const id = selectedPlayerIdRef.current;
        const s  = liveStateRef.current;
        if (!pausedRef.current || id === null || !s) return;
        const p = s.players.find(pl => pl.id === id);
        if (!p) return;
        const step = e.shiftKey ? 0.25 : 1;
        const dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0;
        const dy = e.key === 'ArrowDown'  ? step : e.key === 'ArrowUp'   ? -step : 0;
        gameBus.emit('testCommand', { type: 'movePlayer', id, x: p.x + dx, y: p.y + dy });
        return;
      }

      // B — give ball to selected player (paused only)
      if (e.key === 'b' || e.key === 'B') {
        const id = selectedPlayerIdRef.current;
        if (!pausedRef.current || id === null) return;
        gameBus.emit('testCommand', { type: 'giveBall', id });
        return;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived ───────────────────────────────────────────────────────────────
  const activeState = useMemo(() => {
    const raw = loadedState ?? (mode === '11v11' ? matchState : scenarioState);
    return raw ? normalizeGameState(raw) : null;
  }, [loadedState, mode, matchState, scenarioState]);
  const pitchKey    = loadedState
    ? `loaded-${loadKey}`
    : mode === '11v11'
      ? `11v11-${squadA}-${squadB}-${formIdA}-${formIdB}-${resetKey}`
      : `scenario-${scenario.id}-${resetKey}`;

  const hasSave = useMemo(
    () => !!localStorage.getItem(stateKeyFromSearch(urlSearch)),
    [urlSearch, saveCounter], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const rosterForSidebar = liveGameState?.players ?? playerList;
  const teamA = rosterForSidebar.filter(p => p.team === 'A');
  const teamB = rosterForSidebar.filter(p => p.team === 'B');

  const currentFormation = livePlayer
    ? (livePlayer.team === 'A' ? liveStateRef.current?.formationA : liveStateRef.current?.formationB)
    : null;
  const atkSlot = livePlayer && currentFormation ? currentFormation.attacking[livePlayer.slotIndex] : null;
  const defSlot = livePlayer && currentFormation ? currentFormation.defending[livePlayer.slotIndex] : null;

  const roleData   = livePlayer ? ROLES[livePlayer.role] : null;
  const engineData = roleData?.engine;

  return (
    <div className="flex flex-col gap-3 w-full p-4 h-screen overflow-y-auto">

      {/* ── Mode toggle ── */}
      <div className="flex items-center gap-2">
        {(['11v11', 'scenario'] as Mode[]).map(m => (
          <button
            key={m}
            onClick={() => { setMode(m); setResetKey(k => k + 1); clearDebugLog(); clearBroadcastLine(); }}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold tracking-wider uppercase border transition-colors cursor-pointer ${
              mode === m
                ? 'bg-primary/20 border-primary/40 text-primary'
                : 'bg-secondary/30 border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {m === '11v11' ? '11v11 Setup' : 'Mini Scenarios'}
          </button>
        ))}
      </div>

      {/* ── 11v11 config ── */}
      {mode === '11v11' && (
        <div className="card-arcade rounded-xl p-3 space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-blue-400 tracking-widest uppercase">Team A</p>
              <div className="flex gap-2">
                <select value={squadA} onChange={e => setSquadA(e.target.value)}
                  className="flex-1 bg-secondary/40 border border-border rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/50 cursor-pointer">
                  {Object.entries(SQUADS).map(([id, { label }]) => <option key={id} value={id}>{label}</option>)}
                </select>
                <select value={formIdA} onChange={e => setFormIdA(e.target.value)}
                  className="flex-1 bg-secondary/40 border border-border rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/50 cursor-pointer">
                  {formations.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-red-400 tracking-widest uppercase">Team B</p>
              <div className="flex gap-2">
                <select value={squadB} onChange={e => setSquadB(e.target.value)}
                  className="flex-1 bg-secondary/40 border border-border rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/50 cursor-pointer">
                  {Object.entries(SQUADS).map(([id, { label }]) => <option key={id} value={id}>{label}</option>)}
                </select>
                <select value={formIdB} onChange={e => setFormIdB(e.target.value)}
                  className="flex-1 bg-secondary/40 border border-border rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/50 cursor-pointer">
                  {formations.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            </div>
          </div>
          {/* Per-team attr sliders */}
          <div className="grid grid-cols-2 gap-4">
            {([
              { label: 'Team A Attrs', cls: 'text-blue-400', value: attrA, set: setAttrA },
              { label: 'Team B Attrs', cls: 'text-red-400',  value: attrB, set: setAttrB },
            ] as const).map(({ label, cls, value, set }) => (
              <div key={label} className="space-y-1.5">
                <p className={`text-[10px] font-bold tracking-widest uppercase ${cls}`}>{label}</p>
                <div className="flex items-center gap-2">
                  <input
                    type="range" min={1} max={10} step={1} value={value}
                    onChange={e => set(Number(e.target.value))}
                    className="flex-1 accent-primary cursor-pointer"
                  />
                  <span className="text-xs font-bold text-primary tabular-nums w-4">{value}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Per-team tactics */}
          <div className="grid grid-cols-2 gap-4">
            {(
              [
                { team: 'A' as TeamId, label: 'Team A Tactics', cls: 'text-blue-400', tactics: tacticsA, setTactics: setTacticsA, axes: axesA, setAxes: setAxesA, mentality: mentalityA, setMentality: setMentalityA, fam: famA, setFam: setFamA, morale: moraleA, setMorale: setMoraleA, temp: tempA, setTemp: setTempA, intentOverride: intentOverrideA, setIntentOverride: setIntentOverrideA },
                { team: 'B' as TeamId, label: 'Team B Tactics', cls: 'text-red-400',  tactics: tacticsB, setTactics: setTacticsB, axes: axesB, setAxes: setAxesB, mentality: mentalityB, setMentality: setMentalityB, fam: famB, setFam: setFamB, morale: moraleB, setMorale: setMoraleB, temp: tempB, setTemp: setTempB, intentOverride: intentOverrideB, setIntentOverride: setIntentOverrideB },
              ] as const
            ).map(({ team, label, cls, tactics, setTactics: setT, axes, setAxes: setAX, mentality, setMentality: setM, fam, setFam: setF, morale, setMorale: setMo, temp, setTemp: setTp, intentOverride, setIntentOverride: setIO }) => {
              const liveIntent = liveTeamIntent[team];
              const badge = INTENT_BADGE[liveIntent];
              return (
                <div key={label} className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-[10px] font-bold tracking-widest uppercase ${cls}`}>{label}</p>
                    {/* Live intent badge — reflects engine state, not the override */}
                    <span
                      className={`px-1.5 py-0.5 rounded border text-[9px] font-bold tracking-widest ${badge.cls}`}
                      title="Live team intent (recomputed on possession transfer)"
                    >
                      {badge.label}
                    </span>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {TACTICAL_STYLE_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setT(opt.value)}
                        title={opt.description}
                        className={`px-2 py-1 rounded text-[10px] font-semibold border transition-colors cursor-pointer ${
                          tactics === opt.value
                            ? 'bg-primary/20 border-primary/40 text-primary'
                            : 'bg-secondary/20 border-border/50 text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {/* Axes override — per-axis edit on top of the style (Block C2) */}
                  <div className="space-y-1">
                    <p className="text-[9px] font-bold text-muted-foreground tracking-widest uppercase">Axes</p>
                    <div className="grid grid-cols-2 gap-1">
                      {AXIS_ROWS.map(a => (
                        <select
                          key={a.key}
                          value={axes?.[a.key] ?? ''}
                          onChange={e => {
                            const next = { ...(axes ?? {}) } as Record<string, string>;
                            if (e.target.value) next[a.key] = e.target.value; else delete next[a.key];
                            setAX(Object.keys(next).length ? (next as Partial<TacticalAxes>) : undefined);
                          }}
                          title={a.label}
                          className="bg-secondary/40 border border-border rounded px-1 py-0.5 text-[9px] text-foreground cursor-pointer"
                        >
                          <option value="">{a.label}: {axesFor(tactics)[a.key]}</option>
                          {a.values.map(v => <option key={v} value={v}>{a.label}: {v}</option>)}
                        </select>
                      ))}
                    </div>
                  </div>
                  {/* Mentality — live-match shift on top of the tactical style */}
                  <div className="space-y-1">
                    <p className="text-[9px] font-bold text-muted-foreground tracking-widest uppercase">Mentality</p>
                    <div className="flex gap-1 flex-wrap">
                      {MENTALITY_OPTIONS.map(m => (
                        <button
                          key={m}
                          onClick={() => setM(m)}
                          className={`px-2 py-0.5 rounded text-[9px] font-semibold border transition-colors cursor-pointer ${
                            mentality === m
                              ? 'bg-primary/20 border-primary/40 text-primary'
                              : 'bg-secondary/20 border-border/50 text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {MENTALITY_LABEL[m]}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Style familiarity — nudges the style's own tactic weights (50 = neutral) */}
                  <div className="space-y-1">
                    <p className="text-[9px] font-bold text-muted-foreground tracking-widest uppercase">Familiarity ({fam})</p>
                    <div className="flex gap-1 flex-wrap">
                      {FAMILIARITY_TEST_OPTIONS.map(v => (
                        <button
                          key={v}
                          onClick={() => setF(v)}
                          className={`px-2 py-0.5 rounded text-[9px] font-semibold border transition-colors cursor-pointer ${
                            fam === v
                              ? 'bg-primary/20 border-primary/40 text-primary'
                              : 'bg-secondary/20 border-border/50 text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Morale of the whole side — execution multiplier (65 = neutral) */}
                  <div className="space-y-1">
                    <p className="text-[9px] font-bold text-muted-foreground tracking-widest uppercase">Morale ({morale ?? 'roster'})</p>
                    <div className="flex gap-1 flex-wrap">
                      {MORALE_TEST_OPTIONS.map(v => (
                        <button
                          key={v ?? 'roster'}
                          onClick={() => setMo(v)}
                          className={`px-2 py-0.5 rounded text-[9px] font-semibold border transition-colors cursor-pointer ${
                            morale === v
                              ? 'bg-primary/20 border-primary/40 text-primary'
                              : 'bg-secondary/20 border-border/50 text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {v ?? 'Roster'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Temperament of the whole side - foul / card multiplier (personality, 10.5 = neutral) */}
                  <div className="space-y-1">
                    <p className="text-[9px] font-bold text-muted-foreground tracking-widest uppercase">Temperament ({temp ?? 'roster'})</p>
                    <div className="flex gap-1 flex-wrap">
                      {TEMPERAMENT_TEST_OPTIONS.map(v => (
                        <button
                          key={v ?? 'roster'}
                          onClick={() => setTp(v)}
                          className={`px-2 py-0.5 rounded text-[9px] font-semibold border transition-colors cursor-pointer ${
                            temp === v
                              ? 'bg-primary/20 border-primary/40 text-primary'
                              : 'bg-secondary/20 border-border/50 text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {v ?? 'Roster'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Intent override — debug knob to study scoring effect */}
                  <div className="space-y-1">
                    <p className="text-[9px] font-bold text-muted-foreground tracking-widest uppercase">Intent Override</p>
                    <div className="flex gap-1 flex-wrap">
                      {INTENT_OVERRIDE_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setIO(opt.value)}
                          title={opt.value === 'auto'
                            ? 'Let the engine choose intent on every possession transfer'
                            : `Force ${opt.label} every tick — overrides engine detection`}
                          className={`px-2 py-0.5 rounded text-[9px] font-semibold border transition-colors cursor-pointer ${
                            intentOverride === opt.value
                              ? `${opt.cls} border-current/40 bg-current/10`
                              : 'bg-secondary/20 border-border/50 text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Player instructions (slot variants / pressing / man-marking) ── */}
      {mode === '11v11' && formObjA && formObjB && (
        <div className="card-arcade rounded-xl p-4 grid grid-cols-2 gap-4">
          {(['A', 'B'] as const).map(team => {
            const formation = team === 'A' ? formObjA : formObjB;
            const oppFormation = team === 'A' ? formObjB : formObjA;
            const list = instr[team];
            const setSlot = (slot: number, next: SlotInstruction | null) => {
              const copy = [...list];
              while (copy.length <= slot) copy.push(null);
              copy[slot] = next;
              setInstr(prev => ({ ...prev, [team]: copy }));
              gameBus.emit('testCommand', { type: 'setInstruction', team, slot, instruction: next });
            };
            const marks = manMarks[team];
            const setMarks = (next: { slot: number; targetSlot: number }[]) => {
              setManMarksUi(prev => ({ ...prev, [team]: next }));
              gameBus.emit('testCommand', { type: 'setManMarks', team, marks: next });
            };
            return (
              <div key={team} className="space-y-1.5">
                <p className={`text-[10px] font-bold tracking-widest uppercase ${team === 'A' ? 'text-blue-400' : 'text-red-400'}`}>Team {team} Instructions</p>
                {formation.attacking.map((slot, i) => {
                  if (slot.role === 'GK') return null;
                  const cur = list[i] ?? null;
                  const variants = variantsForRole(slot.role);
                  return (
                    <div key={i} className="flex items-center gap-1 text-[10px]">
                      <span className="w-8 font-bold text-muted-foreground">{slot.role}</span>
                      <select
                        value={cur?.variant ?? ''}
                        onChange={e => setSlot(i, { ...(e.target.value ? { variant: e.target.value as RoleVariantId } : {}), ...(cur?.press ? { press: cur.press } : {}) })}
                        className="bg-secondary/40 border border-border rounded px-1 py-0.5 text-[10px] text-foreground cursor-pointer flex-1"
                      >
                        <option value="">default</option>
                        {variants.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                      <select
                        value={cur?.press ?? 'normal'}
                        onChange={e => setSlot(i, { ...(cur?.variant ? { variant: cur.variant } : {}), ...(e.target.value !== 'normal' ? { press: e.target.value as PressLevel } : {}) })}
                        className="bg-secondary/40 border border-border rounded px-1 py-0.5 text-[10px] text-foreground cursor-pointer"
                      >
                        {(['less', 'normal', 'more'] as const).map(p => <option key={p} value={p}>press {p}</option>)}
                      </select>
                    </div>
                  );
                })}
                <p className="text-[9px] font-bold text-muted-foreground tracking-widest uppercase pt-1">Man-marking (max 2)</p>
                {[0, 1].map(k => {
                  const m = marks[k];
                  return (
                    <div key={k} className="flex items-center gap-1 text-[10px]">
                      <select
                        value={m ? String(m.slot) : ''}
                        onChange={e => {
                          const next = marks.filter((_, j) => j !== k);
                          if (e.target.value) next.splice(k, 0, { slot: Number(e.target.value), targetSlot: m?.targetSlot ?? oppFormation.attacking.findIndex(s => s.role === 'ST') });
                          setMarks(next);
                        }}
                        className="bg-secondary/40 border border-border rounded px-1 py-0.5 text-[10px] text-foreground cursor-pointer flex-1"
                      >
                        <option value="">marker: none</option>
                        {formation.attacking.map((s, i) => s.role === 'GK' ? null : <option key={i} value={i}>marker #{i} {s.role}</option>)}
                      </select>
                      <select
                        value={m ? String(m.targetSlot) : ''}
                        disabled={!m}
                        onChange={e => setMarks(marks.map((x, j) => (j === k ? { ...x, targetSlot: Number(e.target.value) } : x)))}
                        className="bg-secondary/40 border border-border rounded px-1 py-0.5 text-[10px] text-foreground cursor-pointer flex-1"
                      >
                        {oppFormation.attacking.map((s, i) => s.role === 'GK' ? null : <option key={i} value={i}>target #{i} {s.role}</option>)}
                      </select>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Mini scenarios ── */}
      {mode === 'scenario' && (
        <div className="card-arcade rounded-xl overflow-hidden">
          <div className="px-4 py-2 border-b border-border">
            <span className="text-xs font-bold text-muted-foreground tracking-widest uppercase">Scenarios</span>
          </div>
          <div className="p-3 flex flex-wrap gap-2">
            {MINI_SCENARIOS.map(s => (
              <button key={s.id} onClick={() => selectScenario(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                  scenario.id === s.id
                    ? 'bg-primary/20 border-primary/40 text-primary'
                    : 'bg-secondary/30 border-border text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                }`}>
                {s.name}
              </button>
            ))}
          </div>
          <div className="px-4 pb-3 text-xs text-muted-foreground">{scenario.description}</div>
        </div>
      )}

      {/* ── Sim controls ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={reset}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-secondary/30 hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors cursor-pointer font-semibold text-sm">
          <Icon name="refresh" size={14} />Reset
        </button>
        <button onClick={handleSave}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-secondary/30 hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors cursor-pointer font-semibold text-sm">
          <Icon name="save" size={14} />Save
        </button>
        <button onClick={handleSaveDebug}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-yellow-500/40 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 transition-colors cursor-pointer font-semibold text-sm">
          <Icon name="debug" size={14} />Debug
        </button>
        <button onClick={handleLoad} disabled={!hasSave}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors font-semibold text-sm ${
            hasSave
              ? 'border-chart-4/50 bg-chart-4/10 text-chart-4 hover:bg-chart-4/20 cursor-pointer'
              : 'border-border bg-secondary/30 text-muted-foreground opacity-40 cursor-not-allowed'
          }`}>
          <Icon name="upload" size={14} />Load
        </button>
        <button onClick={() => setPaused(p => !p)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-secondary/30 hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors cursor-pointer font-semibold text-sm">
          <Icon name={paused ? 'play' : 'pause'} size={14} />{paused ? 'Play' : 'Pause'}
        </button>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-secondary/30 p-0.5">
          {SPEEDS.map(s => (
            <button key={s.value} onClick={() => setSpeed(s.value)}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                speed === s.value ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground bg-transparent'
              }`}>
              {s.label}
            </button>
          ))}
        </div>
        <span className="text-sm text-muted-foreground tabular-nums whitespace-nowrap" title="Pixi frame rate and average draw time per frame">
          {pitchPerf ? `FPS ${Math.round(pitchPerf.fps)} · ${pitchPerf.drawMs.toFixed(1)} ms` : "FPS –"}
        </span>
        <Chip selected={stadiumOn} onClick={() => setStadiumOn(v => !v)} title="Stadium band with the crowd">Stadium</Chip>
        <Chip selected={officialsOn} onClick={() => setOfficialsOn(v => !v)} title="Referee, assistants and managers">Officials</Chip>
        {stadiumOn && (
          <>
            <OptionChips options={CROWD_FILL_OPTIONS} value={crowdFill} onChange={setCrowdFill} />
            <Chip selected={neutralVenue} onClick={() => setNeutralVenue(v => !v)}>Neutral</Chip>
          </>
        )}
        <button onClick={() => setDebug(d => { setDebugMode(!d); return !d; })}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors cursor-pointer font-semibold text-sm ${
            debug
              ? 'border-chart-4/50 bg-chart-4/10 text-chart-4'
              : 'border-border bg-secondary/30 hover:bg-secondary/50 text-muted-foreground hover:text-foreground'
          }`}>
          <Icon name={debug ? 'debug-active' : 'debug'} size={14} />Debug
        </button>

        {/* ── Phase triggers (test mode — events never fire automatically) ── */}
        <div className="ml-auto flex items-center gap-2">
          {phaseCountdown ? (
            <>
              <span className="text-xs text-amber-400 font-mono tabular-nums">
                {phaseCountdown.target === 'halfTime' ? 'HT' : 'END'} in {phaseCountdown.remaining}…
              </span>
              <button
                onClick={() => setPhaseCountdown(null)}
                className="px-2.5 py-1.5 rounded-lg border border-border bg-secondary/30 hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors cursor-pointer text-xs font-semibold">
                Cancel
              </button>
            </>
          ) : (
            <>
              {((liveGameState?.matchPhase ?? 'firstHalf') === 'firstHalf' ||
                liveGameState?.matchPhase === 'preMatch') && (
                <button
                  onClick={() => setPhaseCountdown({ target: 'halfTime', remaining: 3 })}
                  className="px-2.5 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 transition-colors cursor-pointer text-xs font-semibold">
                  → Half Time
                </button>
              )}
              {(liveGameState?.matchPhase === 'secondHalf' && !liveGameState?.knockout) && (
                <button
                  onClick={() => setPhaseCountdown({ target: 'matchEnd', remaining: 3 })}
                  className="px-2.5 py-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors cursor-pointer text-xs font-semibold">
                  → Match End
                </button>
              )}
              {liveGameState?.knockout &&
                (liveGameState.matchPhase === 'secondHalf' ||
                 liveGameState.matchPhase === 'extraTimeFirst' ||
                 liveGameState.matchPhase === 'extraTimeSecond') && (
                <button
                  onClick={() => gameBus.emit('testCommand', { type: 'triggerPhase', phase: 'endPeriod' })}
                  className="px-2.5 py-1.5 rounded-lg border border-violet-500/40 bg-violet-500/10 hover:bg-violet-500/20 text-violet-300 transition-colors cursor-pointer text-xs font-semibold">
                  → End period ({liveGameState.matchPhase})
                </button>
              )}
              {liveGameState?.shootout && (
                <PenaltyShootoutStrip shootout={liveGameState.shootout} nameA="A" nameB="B" />
              )}
              {debug && liveGameState?.shootout && (
                <div className="text-[10px] font-mono text-white/60 space-y-0.5">
                  {liveGameState.shootout.kicks.slice(0, liveGameState.shootout.shown).map((k, i) => (
                    <div key={i}>
                      {k.team} #{k.takerId} {(k.chance * 100).toFixed(0)}% {k.scored ? "✓" : "✗"}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Live broadcast (commentary ticker) ── */}
      <div className="card-arcade rounded-xl px-4 py-3 border border-primary/20 bg-primary/5">
        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">
          Broadcast
        </div>
        <p className="text-sm text-foreground leading-snug min-h-[1.25rem]">
          {broadcastLine || <span className="text-muted-foreground italic">Waiting for action…</span>}
        </p>
      </div>

      {/* ── Debug overlay toggles ── */}
      {debug && (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mr-1">Overlays</span>
          {(
            [
              { key: 'passLanes'              as const, label: 'Pass Lanes',    color: 'text-emerald-400' },
              { key: 'xG'                     as const, label: 'xG',            color: 'text-orange-400'  },
              { key: 'movementTargets'        as const, label: 'Move Targets',  color: 'text-cyan-400'    },
              { key: 'interceptionCorridors'  as const, label: 'Intercept',     color: 'text-sky-400'     },
              { key: 'marking'               as const, label: 'Marking',       color: 'text-orange-400'  },
              { key: 'throughBallCells'      as const, label: 'TB Cells',      color: 'text-purple-400'  },
              { key: 'switchPlay'            as const, label: 'Switch',        color: 'text-violet-400'  },
              { key: 'aerial'                as const, label: 'Aerial',        color: 'text-teal-300'    },
              { key: 'setPieces'             as const, label: 'Set pieces',    color: 'text-lime-300'    },
              { key: 'instructions'          as const, label: 'Instructions',  color: 'text-sky-300'     },
            ] as const
          ).map(({ key, label, color }) => (
            <button
              key={key}
              onClick={() => toggleOverlay(key)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                debugOverlays[key]
                  ? `border-current/40 bg-current/10 ${color}`
                  : 'border-border bg-secondary/20 text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className={`w-3 h-3 rounded-sm border flex items-center justify-center shrink-0 ${
                debugOverlays[key] ? 'bg-current border-current' : 'border-current/30'
              }`}>
                {debugOverlays[key] && <span className="text-[8px] text-background font-black leading-none">✓</span>}
              </span>
              {label}
            </button>
          ))}
          {/* Crowd heatmap toggle — sits alongside debug overlays but is independent */}
          <button
            onClick={toggleCrowdOverlay}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
              crowdEnabled
                ? 'border-current/40 bg-current/10 text-amber-400'
                : 'border-border bg-secondary/20 text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className={`w-3 h-3 rounded-sm border flex items-center justify-center shrink-0 ${
              crowdEnabled ? 'bg-current border-current' : 'border-current/30'
            }`}>
              {crowdEnabled && <span className="text-[8px] text-background font-black leading-none">✓</span>}
            </span>
            Crowd
          </button>
        </div>
      )}

      {/* ── Crowd heatmap controls + click result panel (only when enabled) ── */}
      {crowdEnabled && (
        <CrowdHeatmapPanel
          mode={crowdMode}
          onModeChange={handleCrowdModeChange}
          config={evalConfig}
          onConfigChange={handleEvalConfigChange}
          result={evalResult}
          clickPos={pitchClickPos}
          attackingTeam={liveGameState ? attackingTeam(liveGameState) : null}
          onClear={handleClearPitchClick}
        />
      )}

      <div className="flex items-center gap-2">
        <button
          className="px-2 py-1 text-xs border border-white/10 rounded hover:bg-white/10"
          onClick={() => setQuickSimOpen((o) => !o)}
        >
          QuickSim
        </button>
        <button
          className="px-2 py-1 text-xs border border-white/10 rounded hover:bg-white/10"
          onClick={() => setStatsOpen((o) => !o)}
        >
          Stats
        </button>
        <button
          className="px-2 py-1 text-xs border border-white/10 rounded hover:bg-white/10"
          onClick={() => setEnergyOpen((o) => !o)}
        >
          Energy
        </button>
        <button
          className="px-2 py-1 text-xs border border-white/10 rounded hover:bg-white/10"
          onClick={() => setHeatmapOpen((o) => !o)}
        >
          Heatmap
        </button>
      </div>
      {heatmapOpen && (
        <div className="mt-2 w-72 rounded border border-white/10 p-3">
          <PossessionHeatmap heatmap={heatmapRef} mirror={false} />
        </div>
      )}
      {quickSimOpen && <div className="mt-2"><QuickSimPanel familiarity={{ home: famA, away: famB }} morale={{ home: moraleA ?? MORALE.NEUTRAL, away: moraleB ?? MORALE.NEUTRAL }} temperament={{ home: tempA, away: tempB }} /></div>}
      {statsOpen && (
        <div className="mt-2 rounded border border-white/10 overflow-hidden">
          <StatsPanel
            players={rosterForSidebar}
            substitutions={liveGameState?.substitutions ?? []}
            teamColorA="#2d6cdf"
            teamColorB="#df3b2d"
          />
        </div>
      )}
      {energyOpen && (
        <div className="mt-2 rounded border border-white/10 overflow-hidden">
          <EnergyPanel
            gameState={liveGameState}
            teamColorA="#2d6cdf"
            teamColorB="#df3b2d"
            staffA={staffOfTestSquad(SQUADS[squadA]!)}
            staffB={staffOfTestSquad(SQUADS[squadB]!)}
            styleA={{ familiarity: famA, execution: getTeamExecutionMult('A'), pressStamina: getDefenseConfig('A').PRESS_STAMINA_MULT }}
            styleB={{ familiarity: famB, execution: getTeamExecutionMult('B'), pressStamina: getDefenseConfig('B').PRESS_STAMINA_MULT }}
          />
        </div>
      )}

      {/* ── Pitch row: Team A | Pitch | Team B ── */}
      <div className="flex-1 flex gap-2 min-h-[460px] min-w-0">
        {/* Team A */}
        {teamA.length > 0 && (
          <TeamList
            team="A"
            players={teamA}
            decisions={liveDecisions}
            offBallIntents={liveOffBallIntents}
            ballHolderId={liveBallHolder}
            selectedId={selectedPlayerId}
            onSelect={handlePlayerClick}
          />
        )}

        {/* Pitch — fills remaining space, locked to PITCH_ASPECT */}
        <div
          ref={pitchHostRef}
          className="flex-1 flex items-center justify-center min-w-0 min-h-0 overflow-hidden"
        >
          {activeState && pitchSize ? (
            <PixiPitch
              key={`${pitchKey}-${pitchSize.w}x${pitchSize.h}-${stadiumOn ? "s" : ""}${officialsOn ? "o" : ""}`}
              canvasWidth={pitchSize.w}
              canvasHeight={pitchSize.h}
              paused={paused}
              debugMode={debug}
              debugOverlays={debugOverlays}
              showYardRefs={true}
              gameSpeed={speed}
              initialState={activeState}
              onPlayerClick={handlePlayerClick}
              onPitchClick={handlePitchClick}
              crowdOverlayEnabled={crowdEnabled}
              crowdOverlayMode={crowdMode}
              crowdEvalConfig={evalConfig}
              crowdClickPos={pitchClickPos}
              keepTickerAlive={true}
              captureRef={pitchCaptureRef}
              perfRef={pitchPerfRef}
              stadium={pitchStadium}
              officials={officialsOn}
              coaches={TEST_COACHES}
            />
          ) : (
            <div className="text-muted-foreground text-sm font-mono">
              {activeState ? 'Sizing pitch…' : 'Loading…'}
            </div>
          )}
        </div>

        {/* Team B */}
        {teamB.length > 0 && (
          <TeamList
            team="B"
            players={teamB}
            decisions={liveDecisions}
            offBallIntents={liveOffBallIntents}
            ballHolderId={liveBallHolder}
            selectedId={selectedPlayerId}
            onSelect={handlePlayerClick}
          />
        )}

        {/* Right column: Decision Scores (top) + Debug Log (bottom) */}
        {debug && (
          <div className="w-56 shrink-0 flex flex-col gap-2 self-stretch">
            <div className="shrink-0">
              <DebugPanel
                gameState={liveGameState ?? activeState ?? undefined}
                selectedPlayerId={selectedPlayerId}
                ballHolderId={liveBallHolder}
                slot="scores"
              />
            </div>
            <div className="flex-1 min-h-0">
              <DebugPanel
                gameState={liveGameState ?? activeState ?? undefined}
                selectedPlayerId={selectedPlayerId}
                ballHolderId={liveBallHolder}
                slot="log"
                logHeightClass="h-[260px]"
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Player detail panel ── */}
      {livePlayer ? (
        <div className="card-arcade rounded-xl overflow-hidden">
          {/* Header */}
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${livePlayer.team === 'A' ? 'bg-blue-500' : 'bg-red-500'}`} />
            <span className="font-bold text-foreground">{livePlayer.name}</span>
            <span className={`text-sm font-semibold ${livePlayer.team === 'A' ? 'text-blue-400' : 'text-red-400'}`}>
              Team {livePlayer.team}
            </span>
            <span className="text-emerald-400 font-semibold">{livePlayer.role}</span>
            <span className="text-muted-foreground text-xs">Slot {livePlayer.slotIndex}</span>
            <span className="text-muted-foreground text-xs ml-auto">
              {livePlayer.attackDir === 1 ? '→ right' : '← left'}
            </span>
            <button
              type="button"
              onClick={() => { setSelectedPlayerId(null); setLivePlayer(null); }}
              aria-label="Close player detail"
              title="Close"
              className="text-muted-foreground hover:text-foreground hover:bg-white/10 rounded p-1 transition-colors cursor-pointer"
            >
              <Icon name="close" size={14} />
            </button>
          </div>

          {/* Sections grid */}
          <div className="grid grid-cols-5 divide-x divide-border text-xs font-mono">

            {/* Position + Formation */}
            <div className="p-3 space-y-3">
              <div className="space-y-1">
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Position</div>
                <StatRow label="x" value={livePlayer.x.toFixed(1) + ' yd'} />
                <StatRow label="y" value={livePlayer.y.toFixed(1) + ' yd'} />
                <StatRow label="bounds.minX" value={livePlayer.bounds.minX} />
                <StatRow label="bounds.maxX" value={livePlayer.bounds.maxX} />
                <StatRow label="bounds.minY" value={livePlayer.bounds.minY.toFixed(1)} />
                <StatRow label="bounds.maxY" value={livePlayer.bounds.maxY.toFixed(1)} />
              </div>
              {atkSlot && defSlot && (
                <div className="space-y-1">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Formation Slot</div>
                  <div className="text-emerald-400 text-[10px] uppercase font-bold mb-0.5">Attacking</div>
                  <StatRow label="x" value={atkSlot.x} />
                  <StatRow label="y" value={atkSlot.y} />
                  <div className="text-orange-400 text-[10px] uppercase font-bold mt-1 mb-0.5">Defending</div>
                  <StatRow label="x" value={defSlot.x} />
                  <StatRow label="y" value={defSlot.y} />
                </div>
              )}
            </div>

            {/* Engine weights */}
            <div className="p-3 space-y-1">
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Engine Weights</div>
              <StatRow label="ballSupportScale" value={livePlayer.ballSupportScale} />
              {engineData && (
                <>
                  <StatRow label="yRange"       value={engineData.yRange} />
                  <StatRow label="bounds.minX"  value={engineData.bounds.minX} />
                  <StatRow label="bounds.maxX"  value={engineData.bounds.maxX} />
                </>
              )}
            </div>

            {/* With ball */}
            <div className="p-3 space-y-1">
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">With Ball</div>
              {Object.entries(livePlayer.runtimeStats.withBall).map(([k, v]) => (
                <StatRow key={k} label={k} value={typeof v === 'number' ? v : String(v)} />
              ))}
            </div>

            {/* Without ball */}
            <div className="p-3 space-y-1">
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Without Ball</div>
              {Object.entries(livePlayer.runtimeStats.withoutBall).map(([k, v]) => (
                <StatRow key={k} label={k} value={typeof v === 'number' ? v : String(v)} />
              ))}
            </div>

            {/* Current decision */}
            <div className="p-3 space-y-1">
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Decision</div>
              {liveStateRef.current && (() => {
                const dec = liveStateRef.current.decisions[livePlayer.id];
                if (!dec) return <div className="text-muted-foreground">—</div>;
                const badge = DECISION_BADGE[dec.type];
                if (!badge) return <div className="text-muted-foreground">{dec.type}</div>;
                return (
                  <div className="space-y-2">
                    <div className={`inline-block px-2 py-0.5 rounded border font-bold text-sm ${badge.cls}`}>
                      {badge.label}
                    </div>
                    {dec.type === 'carry' && (
                      <div className="space-y-1">
                        <StatRow label="dx" value={dec.dx} />
                        <StatRow label="dy" value={dec.dy} />
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      ) : (
        <div className="card-arcade rounded-xl px-4 py-3 text-xs text-muted-foreground">
          Click a player on the pitch or in the team list to inspect their stats and weights.
        </div>
      )}

    </div>
  );
}

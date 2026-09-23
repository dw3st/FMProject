import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { PixiPitch, DEFAULT_DEBUG_OVERLAYS } from "@/GraficsEngine/PixiPitch";
import type { DebugOverlays } from "@/GraficsEngine/PixiPitch";
import { DebugPanel } from "@/GameInterface/DebugPanel";
import { QuickSimPanel } from "@/GameInterface/QuickSimPanel";
import { CrowdHeatmapPanel } from "@/GameInterface/CrowdHeatmapPanel";
import type { CrowdMode } from "@/GameInterface/CrowdHeatmapPanel";
import { Icon } from "@/GameInterface/Icons";
import { evaluatePoint, DEFAULT_EVAL_CONFIG } from "@/GameEngine/Infrastructure/SpatialEvaluation";
import type { EvaluationConfig, EvaluationResult } from "@/GameEngine/Infrastructure/SpatialEvaluation";
import { attackingTeam } from "@/GameEngine/Infrastructure/CrowdGrid";
import { setDebugMode, clearDebugLog } from "@/GameEngine/Suport/DebugLog";
import {
  clearBroadcastLine,
  getBroadcastLine,
  onBroadcastLine,
} from "@/GameInterface/Broadcast/BroadcastLog";
import "@/GameEngine/Suport/DebugSubscriber";
import "@/GameInterface/Broadcast/BroadcastSubscriber";
import { TEST_SCENARIOS } from "@/GameEngine/Suport/TestCases";
import type { TestScenario } from "@/GameEngine/Suport/TestCases";
import { createMatchState } from "@/GameEngine/Domain/gameState";
import { teamLineup } from "@/GameEngine/Domain/TeamLineup";
import { getRuntimeLineup, normalizeGameState } from "@/GameEngine/Domain/RuntimeLineup";
import { gameBus, type GameEvents } from "@/GameEngine/Infrastructure/EventBus";
import { applyTeamTacticsConfig } from "@/GameEngine/Configs/DefenseConfig";
import { applyTeamAttackConfig } from "@/GameEngine/Configs/AttackConfig";
import { DEFAULT_TACTICAL_STYLE, TACTICAL_STYLE_OPTIONS } from "@/types/tacticsTypes";
import type { TacticalStyle } from "@/types/tacticsTypes";
import type { GameState, GamePlayer, Formation, TeamIntent, TeamId } from "@/GameEngine/types";
import type { PlayerDecision } from "@/GameEngine/Domain/DecisionTree";
import type { PlayerStatsRecord, RosterPlayer } from "@/types/playerTypes";
import playersJson from "@/Data/players.json";
import rolesJson from "@/Data/roles.json";
import formation433Fallback from "@/Data/formations/4-3-3.json";

// ── Constants ────────────────────────────────────────────────────────────────

/** If `/api/formations` is unreachable (wrong dev server, no Bun, etc.), still populate dropdowns. */
const FORMATION_IDS_FALLBACK = [
  "3-4-3", "3-5-2", "4-1-4-1", "4-2-2-2", "4-2-3-1", "4-3-1-2", "4-3-3", "4-4-2", "4-5-1", "5-3-2",
] as const;

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
  return str ? `touchlines-test-state:${str}` : 'touchlines-test-state';
}

const DECISION_BADGE: Record<PlayerDecision["type"], { label: string; cls: string }> = {
  carry:                { label: "CARRY",   cls: "text-emerald-400 border-emerald-400/50" },
  shoot:                { label: "SHOOT",   cls: "text-red-400 border-red-400/50" },
  pass:                 { label: "PASS",    cls: "text-blue-400 border-blue-400/50" },
  through_ball:         { label: "TB",      cls: "text-purple-400 border-purple-400/50" },
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
  // Intent overrides — 'auto' lets the engine decide on possession transfer;
  // a fixed value force-pins the team's intent every tick so we can study its effect.
  const [intentOverrideA, setIntentOverrideA] = useState<IntentOverride>('auto');
  const [intentOverrideB, setIntentOverrideB] = useState<IntentOverride>('auto');
  // Live readout of the engine's per-team intent. Updated from teamIntentChanged
  // and stateChanged so the badge stays accurate even after manual overrides.
  const [liveTeamIntent, setLiveTeamIntent] = useState<{ A: TeamIntent; B: TeamIntent }>({ A: 'balanced', B: 'balanced' });
  const [matchState, setMatchState] = useState<GameState | null>(null);
  const [scenario, setScenario]   = useState<TestScenario>(() => {
    const id = urlStr('scene'); return MINI_SCENARIOS.find(s => s.id === id) ?? MINI_SCENARIOS[0]!;
  });
  const [scenarioState, setScenarioState] = useState<GameState | null>(null);
  const [resetKey, setResetKey]   = useState(0);
  const [paused, setPaused]       = useState(false);
  const [speed, setSpeed]         = useState(1);
  const [debug, setDebug]         = useState(true);
  const [quickSimOpen, setQuickSimOpen] = useState(false);
  const [broadcastLine, setBroadcastLine] = useState(() => getBroadcastLine());
  const [debugOverlays, setDebugOverlays] = useState<DebugOverlays>(() => {
    try {
      const s = localStorage.getItem('touchlines-debug-overlays');
      return s ? { ...DEFAULT_DEBUG_OVERLAYS, ...JSON.parse(s) as Partial<DebugOverlays> } : DEFAULT_DEBUG_OVERLAYS;
    } catch { return DEFAULT_DEBUG_OVERLAYS; }
  });

  // ── Crowd overlay state ─────────────────────────────────────────────────
  const [crowdEnabled, setCrowdEnabled] = useState<boolean>(() => {
    try {
      const s = localStorage.getItem('touchlines-crowd-enabled');
      return s === 'true';
    } catch { return false; }
  });
  const [crowdMode, setCrowdMode] = useState<CrowdMode>(() => {
    try {
      const s = localStorage.getItem('touchlines-crowd-mode');
      return s === 'attack' || s === 'defense' || s === 'crowd' ? s : 'crowd';
    } catch { return 'crowd'; }
  });
  const [evalConfig, setEvalConfig] = useState<EvaluationConfig>(() => {
    try {
      const s = localStorage.getItem('touchlines-crowd-eval-config');
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
      .then(list => setFormations(list.map(f => f.id)))
      .catch(() => {
        console.warn(
          "[Test] /api/formations failed — open this app via `bun dev` (same origin as the API). Using bundled formation list.",
        );
        setFormations([...FORMATION_IDS_FALLBACK]);
      });
  }, []);

  useEffect(() => {
    fetch(`/api/formations/${formIdA}`)
      .then(r => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<Formation>;
      })
      .then(setFormObjA)
      .catch(() => setFormObjA(formation433Fallback as Formation));
  }, [formIdA]);

  useEffect(() => {
    fetch(`/api/formations/${formIdB}`)
      .then(r => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<Formation>;
      })
      .then(setFormObjB)
      .catch(() => setFormObjB(formation433Fallback as Formation));
  }, [formIdB]);

  useEffect(() => {
    if (!formObjA || !formObjB) return;
    const base = createMatchState(SQUADS[squadA]!.players, formObjA, SQUADS[squadB]!.players, formObjB);
    const state = { ...base, testMode: true, players: applyAttrOverride(base.players, attrARef.current, attrBRef.current) };
    setMatchState(state);
    setPlayerList(state.players);
    setSelectedPlayerId(null);
    setLivePlayer(null);
    setLiveGameState(null); // clear stale state so sidebar uses the new playerList immediately
  }, [squadA, squadB, formObjA, formObjB]);

  useEffect(() => {
    const base = scenario.createState();
    const state = { ...base, testMode: true, players: applyAttrOverride(base.players, attrARef.current, attrBRef.current) };
    setScenarioState(state);
    setPlayerList(state.players);
    setSelectedPlayerId(null);
    setLivePlayer(null);
  }, [scenario, resetKey]);

  useEffect(() => { applyTeamTacticsConfig('A', tacticsA); applyTeamAttackConfig('A', tacticsA); gameBus.emit('tacticsChanged', { team: 'A' }); }, [tacticsA]);
  useEffect(() => { applyTeamTacticsConfig('B', tacticsB); applyTeamAttackConfig('B', tacticsB); gameBus.emit('tacticsChanged', { team: 'B' }); }, [tacticsB]);

  // When attr sliders change, patch live player stats immediately
  useEffect(() => {
    const s = liveStateRef.current;
    if (!s) return;
    const players = applyAttrOverride(s.players, attrA, attrB);
    gameBus.emit('testCommand', { type: 'patchPlayers', players });
    setPlayerList(players);
  }, [attrA, attrB]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return gameBus.on('stateChanged', s => {
      liveStateRef.current = s;
      setLiveDecisions(s.decisions);
      setLiveBallHolder(s.ballHolderId);
      setLiveGameState(s);
      if (s.teamIntent) setLiveTeamIntent(s.teamIntent);
      if (selectedPlayerId !== null) {
        const p = s.players.find(pl => pl.id === selectedPlayerId) ?? null;
        setLivePlayer(p);
      }
      // Live re-evaluate the parked click each tick — keeps the panel in sync
      // as players move (also useful when this gets wired into engine systems).
      const pos = pitchClickPosRef.current;
      if (pos) {
        setEvalResult(evaluatePoint(s, pos.x, pos.y, evalConfigRef.current));
      }
    });
  }, [selectedPlayerId]);

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
      Aattr:  attrA !== 10 ? String(attrA) : null,
      Battr:  attrB !== 10 ? String(attrB) : null,
      scene:  mode === 'scenario' && scenario.id !== MINI_SCENARIOS[0]?.id ? scenario.id : null,
    });
    history.replaceState(null, '', search || window.location.pathname);
    setUrlSearch(search);
  }, [mode, squadA, squadB, formIdA, formIdB, tacticsA, tacticsB, attrA, attrB, scenario]); // eslint-disable-line react-hooks/exhaustive-deps

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
      ball: { x: s.ball?.x ?? null, y: s.ball?.y ?? null },
      score: s.score,
      matchTime: s.matchTime,
      players: s.players.map(p => ({
        id:         p.id,
        name:       p.name,
        team:       p.team,
        role:       p.role,
        mainRole:   p.mainRole,
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
      localStorage.setItem('touchlines-debug-overlays', JSON.stringify(next));
      return next;
    });
  }, []);

  const toggleCrowdOverlay = useCallback(() => {
    setCrowdEnabled(prev => {
      const next = !prev;
      localStorage.setItem('touchlines-crowd-enabled', String(next));
      return next;
    });
  }, []);

  const handleCrowdModeChange = useCallback((m: CrowdMode) => {
    setCrowdMode(m);
    localStorage.setItem('touchlines-crowd-mode', m);
  }, []);

  const handleEvalConfigChange = useCallback((next: EvaluationConfig) => {
    setEvalConfig(next);
    localStorage.setItem('touchlines-crowd-eval-config', JSON.stringify(next));
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
  useEffect(() => { pausedRef.current = paused; }, [paused]);

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
  const dpData     = roleData?.dpWeights;

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
                { team: 'A' as TeamId, label: 'Team A Tactics', cls: 'text-blue-400', tactics: tacticsA, setTactics: setTacticsA, intentOverride: intentOverrideA, setIntentOverride: setIntentOverrideA },
                { team: 'B' as TeamId, label: 'Team B Tactics', cls: 'text-red-400',  tactics: tacticsB, setTactics: setTacticsB, intentOverride: intentOverrideB, setIntentOverride: setIntentOverrideB },
              ] as const
            ).map(({ team, label, cls, tactics, setTactics: setT, intentOverride, setIntentOverride: setIO }) => {
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
              {(liveGameState?.matchPhase ?? 'firstHalf') !== 'secondHalf' &&
               (liveGameState?.matchPhase ?? 'firstHalf') !== 'matchEnd' && (
                <button
                  onClick={() => setPhaseCountdown({ target: 'halfTime', remaining: 3 })}
                  className="px-2.5 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 transition-colors cursor-pointer text-xs font-semibold">
                  → Half Time
                </button>
              )}
              {(liveGameState?.matchPhase === 'secondHalf') && (
                <button
                  onClick={() => setPhaseCountdown({ target: 'matchEnd', remaining: 3 })}
                  className="px-2.5 py-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors cursor-pointer text-xs font-semibold">
                  → Match End
                </button>
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

      <div>
        <button
          className="px-2 py-1 text-xs border border-white/10 rounded hover:bg-white/10"
          onClick={() => setQuickSimOpen((o) => !o)}
        >
          QuickSim
        </button>
        {quickSimOpen && <div className="mt-2"><QuickSimPanel /></div>}
      </div>

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
              key={`${pitchKey}-${pitchSize.w}x${pitchSize.h}`}
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

/**
 * TestCases — predefined game scenarios for engine tuning and debugging.
 *
 * Each scenario returns a GameState with a small, hand-crafted set of players
 * so specific mechanics (carrying, tackling, shooting, interception, pass lanes)
 * can be observed in isolation.
 *
 * Layer: GameEngine — no React, no Pixi, no DOM.
 */

import type { GameState, GamePlayer, Formation, TeamId, PlayerRole } from '@/GameEngine/types';
import { teamLineup } from '@/GameEngine/Domain/TeamLineup';
import { getRuntimeLineup } from '@/GameEngine/Domain/RuntimeLineup';
import { PITCH_LENGTH } from '@/GameEngine/Domain/pitch';
import { EMPTY_DECISION_MEMORY } from '@/GameEngine/Domain/DecisionTree';
import rolesJson from '@/Data/roles.json';

import { applyTeamInstructions, awardCorner, createMatchState, forceInjurySubstitution, maybeFoul, setManMarksBySlot } from '@/GameEngine/Domain/gameState';
import playersJson from '@/Data/players.json';
import formation433Json from '@/Data/formations/4-3-3.json';
import formationDiamondJson from '@/Data/formations/4-1-2-1-2.json';
import type { PlayerStatsRecord, RosterPlayer } from '@/types/playerTypes';
import { emptySeasonLog } from '@/types/playerTypes';
import { FITNESS } from '@/Domain/fitness/fitnessConfig';
import { drainMultiplier as loadDrainMultiplier } from '@/Domain/fitness/fitness';

// ── Attribute presets (full roster shape; unused fields set to neutral test values) ──

const STRIKER: PlayerStatsRecord = {
  passing: 7, vision: 7, finishing: 9, dribbling: 8, speed: 8, acceleration: 8, tackling: 3, pressing: 7,
  stamina: 7, heading: 8, strength: 7, reflex: 5, jump: 8,
};
const WINGER: PlayerStatsRecord = {
  passing: 7, vision: 7, finishing: 6, dribbling: 8, speed: 9, acceleration: 9, tackling: 4, pressing: 7,
  stamina: 7, heading: 6, strength: 6, reflex: 5, jump: 7,
};
const MIDFIELDER: PlayerStatsRecord = {
  passing: 8, vision: 8, finishing: 5, dribbling: 7, speed: 6, acceleration: 7, tackling: 7, pressing: 8,
  stamina: 8, heading: 6, strength: 7, reflex: 6, jump: 6,
};
const DEFENDER: PlayerStatsRecord = {
  passing: 6, vision: 7, finishing: 2, dribbling: 4, speed: 7, acceleration: 7, tackling: 9, pressing: 8,
  stamina: 8, heading: 8, strength: 8, reflex: 6, jump: 8,
};
const GOALKEEPER: PlayerStatsRecord = {
  passing: 6, vision: 6, finishing: 1, dribbling: 3, speed: 5, acceleration: 5, tackling: 4, pressing: 3,
  stamina: 7, heading: 4, strength: 6, reflex: 8, jump: 7,
};

// ── Dummy formation for mini test scenarios ───────────────────────────────────

/**
 * Minimal single-slot formation used by hand-crafted test scenarios.
 * Positioning.ts will use slot 0 for all test players; the base position
 * ends up ignored since test players are placed explicitly via makePlayer().
 */
const DUMMY_FORMATION: Formation = {
  id: 'dummy',
  attacking: [{ role: 'ST', x: 80, y: 37 }],
  defending: [{ role: 'ST', x: 80, y: 37 }],
};

// ── Player factory ────────────────────────────────────────────────────────────

let _nextId = 1;

function makePlayer(
  name: string,
  team: TeamId,
  role: PlayerRole,
  x: number,
  y: number,
  attrs: PlayerStatsRecord,
): GamePlayer {
  const id      = _nextId++;
  const roleEng = (rolesJson as Record<string, { engine: { ballSupportScale: number; bounds: { minX: number; maxX: number } } }>)[role]!.engine;
  const bounds  = team === 'A'
    ? { minX: roleEng.bounds.minX, maxX: roleEng.bounds.maxX, minY: 0, maxY: 74 }
    : { minX: PITCH_LENGTH - roleEng.bounds.maxX, maxX: PITCH_LENGTH - roleEng.bounds.minX, minY: 0, maxY: 74 };
  const baseStats = teamLineup(attrs, role);
  const energy = 100;
  return {
    id, name, team, role,
    rosterId:         String(id),
    attackDir:        (team === 'A' ? 1 : -1) as 1 | -1,
    x, y,
    baseStats,
    runtimeStats:     getRuntimeLineup(baseStats, { energy }),
    energy,
    startEnergy:      energy,
    stamina:          attrs.stamina,
    ballSupportScale: roleEng.ballSupportScale,
    slotIndex:        0,
    basePosition:     { x, y },
    targetPosition:   { x, y },
    bounds,
    recoveryTime:     0,
    justReceivedTicks: 0,
    decisionMemory:   EMPTY_DECISION_MEMORY,
    // Engine-tuning scenarios don't model injuries — pin baseline (no extra risk) values.
    age:              25,
    strengthAttr:     attrs.strength,
    injuryLoad:       0,
  };
}

function buildState(players: GamePlayer[], ballHolderId: number): GameState {
  return {
    players,
    formationA:            DUMMY_FORMATION,
    formationB:            DUMMY_FORMATION,
    ballHolderId,
    pass:                  null,
    shot:                  null,
    looseBall:             null,
    score:                 { A: 0, B: 0 },
    tackleCooldown:        0,
    setPiece:              null,
    decisions:             {},
    matchPhase:            'firstHalf',
    matchTime:             0,
    extraTimeFirst:        0,
    extraTimeSecond:       0,
    presentationCountdown: 0,
    possessionTime:        0,
    lastPasserId:          null,
    teamIntent:            { A: 'balanced', B: 'balanced' },
  } as GameState;
}

// ── Scenario type ─────────────────────────────────────────────────────────────

export interface TestScenario {
  id:          string;
  name:        string;
  description: string;
  createState(): GameState;
}

// ── Scenarios ─────────────────────────────────────────────────────────────────

const roster = playersJson as RosterPlayer[];
const teamRedPlayers  = roster.filter(p => p.squadId === 'team_red');
const teamBluePlayers = roster.filter(p => p.squadId === 'team_blue');

/**
 * `createMatchState`'s no-history fallback (`gameState.ts`) values a roster with no `seasonLog` at
 * `matchStartEnergy(emptySeasonLog().fitness)` (~83) for consistency with quickSim/the lineup
 * selector — see `.claude/rules/game/fitness.md`. These hand-crafted engine-tuning scenarios exist
 * to observe carry/pass/tackle/etc. logic in isolation, not the fitness system, so they explicitly
 * pin a full, uncompressed 100 energy instead of picking up that default.
 */
function freshRoster(players: RosterPlayer[]): RosterPlayer[] {
  return players.map(p => ({ ...p, seasonLog: { ...emptySeasonLog(), fitness: 100 } }));
}

/**
 * Sets a team's energy to `energy` and its `drainMultiplier` from `load` (see
 * `src/Domain/fitness/fitness.ts` → `drainMultiplier`), on every player currently on the pitch
 * AND the bench — a substitute brought on mid-match should be just as fatigued as the XI, since
 * they came off a congested fixture list too. Used by the `tired-team` scenario below.
 */
function applyFatigue(state: GameState, team: TeamId, energy: number, load: number): GameState {
  const mult = loadDrainMultiplier(load);
  const patch = (p: GamePlayer): GamePlayer => {
    if (p.team !== team) return p;
    return {
      ...p,
      energy,
      startEnergy: energy,
      drainMultiplier: mult,
      fatigueBaselineEnergy: energy,
      runtimeStats: getRuntimeLineup(p.baseStats, { energy }),
    };
  };
  return {
    ...state,
    players: state.players.map(patch),
    benchA: team === 'A' ? state.benchA.map(patch) : state.benchA,
    benchB: team === 'B' ? state.benchB.map(patch) : state.benchB,
  };
}

export const TEST_SCENARIOS: TestScenario[] = [
  {
    id:          '11v11-classic',
    name:        '11v11 — Classic Match',
    description: 'Full 11v11 using the original team_red vs team_blue test roster in a 4-3-3.',
    createState() {
      const f433 = formation433Json as Formation;
      return createMatchState(freshRoster(teamRedPlayers), f433, freshRoster(teamBluePlayers), f433);
    },
  },

  {
    id:          'knockout-draw-90',
    name:        '11v11 — Knockout level at 90\'',
    description: 'Knockout match, 1–1 late in the second half. Use "End period" to go through extra time and penalties.',
    createState() {
      const f433 = formation433Json as Formation;
      return {
        ...createMatchState(freshRoster(teamRedPlayers), f433, freshRoster(teamBluePlayers), f433),
        knockout:   true,
        matchPhase: 'secondHalf',
        matchTime:  2640,
        score:      { A: 1, B: 1 },
        presentationCountdown: 0,
      };
    },
  },

  {
    id:          '1v1-duel',
    name:        '1v1 — Attacker vs Defender',
    description: 'ST with ball at midfield vs a CB. Tests carrying, lane detection, and tackling.',
    createState() {
      _nextId = 1;
      return buildState([
        makePlayer('Santos',  'A', 'ST', 60, 37, STRIKER),
        makePlayer('Silva',   'B', 'CB', 72, 37, DEFENDER),
      ], 1);
    },
  },

  {
    id:          'striker-vs-gk',
    name:        'Striker vs GK',
    description: 'ST alone near the penalty spot. Tests shooting accuracy and GK positioning.',
    createState() {
      _nextId = 1;
      return buildState([
        makePlayer('Santos',   'A', 'ST', 95, 37, STRIKER),
        makePlayer('Kowalski', 'B', 'GK', 110, 37, GOALKEEPER),
      ], 1);
    },
  },

  {
    id:          '2v1',
    name:        '2v1 — Attackers vs Defender',
    description: 'ST with ball + a wide winger vs one CB. Tests pass lane selection and combination play.',
    createState() {
      _nextId = 1;
      return buildState([
        makePlayer('Santos',  'A', 'ST', 65, 37, STRIKER),
        makePlayer('Chen',    'A', 'LW', 70, 12, WINGER),
        makePlayer('Silva',   'B', 'CB', 75, 37, DEFENDER),
      ], 1);
    },
  },

  {
    id:          'pass-interception',
    name:        'Pass Lane Interception',
    description: 'CM with two pass options. Defender blocks the central lane — should prefer the wide option.',
    createState() {
      _nextId = 1;
      return buildState([
        makePlayer('Garcia',  'A', 'CM', 50, 37, MIDFIELDER),  // passer
        makePlayer('Santos',  'A', 'ST', 75, 37, STRIKER),     // blocked lane (defender in front)
        makePlayer('Chen',    'A', 'LW', 68, 12, WINGER),      // open lane
        makePlayer('Diallo',  'B', 'CDM', 62, 36, MIDFIELDER), // sits in Santos lane
      ], 1);
    },
  },

  {
    id:          'free-carrier',
    name:        'Free Carrier',
    description: 'Winger alone in open space with the ball. Observes carry lane logic and speed.',
    createState() {
      _nextId = 1;
      return buildState([
        makePlayer('Ndiaye', 'A', 'LW', 45, 15, WINGER),
      ], 1);
    },
  },

  {
    id:          '3v2-plus-gk',
    name:        '3v2 + GK',
    description: '3 attackers against 2 defenders and a GK. Tests full attacking combination with shooting.',
    createState() {
      _nextId = 1;
      return buildState([
        makePlayer('Santos',   'A', 'ST',  75, 37, STRIKER),
        makePlayer('Chen',     'A', 'LW',  72, 14, WINGER),
        makePlayer('Reyes',    'A', 'RW',  72, 60, WINGER),
        makePlayer('Silva',    'B', 'CB',  85, 28, DEFENDER),
        makePlayer('Okeke',    'B', 'CB',  85, 46, DEFENDER),
        makePlayer('Kowalski', 'B', 'GK', 110, 37, GOALKEEPER),
      ], 1);
    },
  },

  {
    id:          'through-ball-channel',
    name:        'Through Ball — Channel Run',
    description: 'CM with ball, ST holding the line, two CBs and a deeper CDM. The cell heatmap should highlight the channel between the CBs as the best through-ball target. Toggle "TB Cells" to see scored candidates.',
    createState() {
      _nextId = 1;
      return buildState([
        makePlayer('Garcia',   'A', 'CM', 50, 37, MIDFIELDER),  // passer
        makePlayer('Santos',   'A', 'ST', 70, 37, STRIKER),     // intended runner
        makePlayer('Chen',     'A', 'LW', 65, 12, WINGER),      // wide alt
        makePlayer('Silva',    'B', 'CB', 78, 32, DEFENDER),
        makePlayer('Okeke',    'B', 'CB', 78, 42, DEFENDER),
        makePlayer('Diallo',   'B', 'CDM', 60, 37, MIDFIELDER), // sits between passer and runner
        makePlayer('Kowalski', 'B', 'GK', 110, 37, GOALKEEPER),
      ], 1);
    },
  },

  {
    id:          'cross-to-box',
    name:        'Aerial — Cross to the Box',
    description: 'LW wide on the left, ~26 yds from the byline, with the ST and CAM arriving in the box against two CBs and the keeper (`.claude/rules/game-engine/aerial.md`). The holder should choose CROSS; toggle "Aerial" to see the three scored targets (near post / penalty spot / far post), then the landing point, the AERIAL_RADIUS ring and the chasers during the flight. Watch the "aerial" debug log for the duel, keeper claim/punch, header or clearance.',
    createState() {
      _nextId = 1;
      return buildState([
        makePlayer('Chen',     'A', 'LW',  89, 6,  WINGER),     // crosser
        makePlayer('Santos',   'A', 'ST', 101, 36, STRIKER),    // attacks the penalty spot / near post
        makePlayer('Rossi',    'A', 'CAM', 96, 44, MIDFIELDER), // arrives at the far post
        makePlayer('Silva',    'B', 'CB', 104, 33, DEFENDER),
        makePlayer('Okeke',    'B', 'CB', 104, 41, DEFENDER),
        makePlayer('Kowalski', 'B', 'GK', 113, 37, GOALKEEPER),
      ], 1);
    },
  },

  {
    id:          'switch-play-wide',
    name:        'Switch Play — Wide Hold',
    description: 'LW holds wide on the near touchline with the near side congested and the far flank open. Override intent to "switch_play" and toggle "Switch" to see the far-flank carry lane + far-side receivers.',
    createState() {
      _nextId = 1;
      return buildState([
        makePlayer('Chen',     'A', 'LW',  60, 12, WINGER),     // wide holder (near touchline)
        makePlayer('Reyes',    'A', 'RW',  64, 60, WINGER),     // far-side switch target
        makePlayer('Garcia',   'A', 'CM',  52, 30, MIDFIELDER), // central support
        makePlayer('Silva',    'B', 'CB',  70, 20, DEFENDER),   // congest near side
        makePlayer('Okeke',    'B', 'CDM', 62, 24, MIDFIELDER), // congest near side
        makePlayer('Kowalski', 'B', 'GK', 110, 37, GOALKEEPER),
      ], 1);
    },
  },

  {
    id:          'byline-winger',
    name:        'Byline — Winger Near the Goal Line',
    description: 'Winger with the ball 2 yds from the end line, wide of the box. Carry lanes that run along the byline are penalised (CARRY_CONFIG.BYLINE_RUN_*); expect a cut inside, a cross-style pass to Santos, or a pass instead of a run down the line.',
    createState() {
      _nextId = 1;
      return buildState([
        makePlayer('Chen',     'A', 'LW', 113, 8,  WINGER),
        makePlayer('Santos',   'A', 'ST', 104, 37, STRIKER),
        makePlayer('Garcia',   'A', 'CM',  96, 26, MIDFIELDER),
        makePlayer('Silva',    'B', 'CB', 107, 32, DEFENDER),
        makePlayer('Okeke',    'B', 'CB', 107, 42, DEFENDER),
        makePlayer('Kowalski', 'B', 'GK', 112, 37, GOALKEEPER),
      ], 1);
    },
  },

  {
    id:          'byline-near-post',
    name:        'Byline — Winger Next to the Post (#37)',
    description: 'Winger with the ball 2 yds from the end line INSIDE the box width, next to the post, next to the post. Byline lanes inside the box are now penalised too (CARRY_CONFIG.BYLINE_RUN_PENALTY_IN_BOX); expect a shot or a cut-back pass to Santos instead of a run along the goal line.',
    createState() {
      _nextId = 1;
      return buildState([
        makePlayer('Chen',     'A', 'LW', 113, 22, WINGER),
        makePlayer('Santos',   'A', 'ST', 104, 40, STRIKER),
        makePlayer('Okeke',    'B', 'CB', 108, 38, DEFENDER),
        makePlayer('Kowalski', 'B', 'GK', 113, 36, GOALKEEPER),
      ], 1);
    },
  },

  {
    id:          'byline-diagonal-run',
    name:        'Byline — Diagonal Run Into the Goal Line (#42)',
    description: 'Winger carrying at 106,20 with no outfield defender ahead (only the GK). Before #42 the forward lane aimed at the near post, the carrier reached the goal line and the pitch clamp turned the lane into a slide along the line (path clearness read 1 at the end line, so every byline penalty faded). Expect a cut inside toward the front of goal (CARRY_CONFIG.BYLINE_AIM_*), then a shot or a pass — never a run along x=115.',
    createState() {
      _nextId = 1;
      return buildState([
        makePlayer('Chen',     'A', 'LW', 106, 20, WINGER),
        makePlayer('Santos',   'A', 'ST',  96, 40, STRIKER),
        makePlayer('Silva',    'B', 'CB',  95, 30, DEFENDER),
        makePlayer('Okeke',    'B', 'CB',  94, 44, DEFENDER),
        makePlayer('Kowalski', 'B', 'GK', 113, 37, GOALKEEPER),
      ], 1);
    },
  },

  {
    id:          'touchline-carrier',
    name:        'Touchline — Carrier Hugging the Line (#37)',
    description: 'Winger with the ball 1 yd from the top touchline in midfield. Carry lanes ending within CARRY_CONFIG.TOUCHLINE_RUN_ZONE of a touchline are penalised, and off-ball teammates keep OFF_BALL_TOUCHLINE_MARGIN off the line with a 3-yd separation — expect a carry/pass infield, no teammates stacked on the line.',
    createState() {
      _nextId = 1;
      return buildState([
        makePlayer('Chen',     'A', 'LW',  70, 1,  WINGER),
        makePlayer('Lopes',    'A', 'LB',  60, 3,  DEFENDER),
        makePlayer('Garcia',   'A', 'CM',  62, 12, MIDFIELDER),
        makePlayer('Santos',   'A', 'ST',  85, 30, STRIKER),
        makePlayer('Okeke',    'B', 'CM',  72, 14, MIDFIELDER),
        makePlayer('Kowalski', 'B', 'GK', 112, 37, GOALKEEPER),
      ], 1);
    },
  },

  {
    id:          'wide-vs-narrow',
    name:        '11v11 — Wide vs narrow shape (formation balance)',
    description: 'Team A 4-3-3 (wingers on the touchline) vs Team B 4-1-2-1-2 diamond. Watch the defending block slide toward the ball side (the far-side winger tucks in) and the wide forwards close in on the box when the ball reaches the final third (Etapa 19, `.claude/rules/game/formations.md`).',
    createState() {
      const f433 = formation433Json as Formation;
      const diamond = formationDiamondJson as Formation;
      return createMatchState(freshRoster(teamRedPlayers), f433, freshRoster(teamBluePlayers), diamond);
    },
  },

  {
    id:          'tired-team',
    name:        '11v11 — Tired Team (fixture congestion)',
    description: 'Team A starts at 60 energy with the load-derived drain multiplier from FITNESS.LOAD_HIGH (fresh Team B) — mirrors a squad deep into a congested fixture list. Toggle the Energy panel to watch Team A fade and the AI make fatigue substitutions.',
    createState() {
      const f433 = formation433Json as Formation;
      const base = createMatchState(freshRoster(teamRedPlayers), f433, freshRoster(teamBluePlayers), f433);
      return applyFatigue(base, 'A', 60, FITNESS.LOAD_HIGH);
    },
  },

  {
    id:          'morale-gap',
    name:        '11v11 — Morale gap',
    description: 'Team A players at morale 100 (very happy, attributes x1.020), Team B at 20 (furious, x0.986) from the roster itself — the per-player path of a real match (`.claude/rules/game/morale.md`). Keep the Morale selectors on "Roster" and open the Energy panel to see the multiplier of each side.',
    createState() {
      const f433 = formation433Json as Formation;
      const withMorale = (ps: RosterPlayer[], morale: number) => freshRoster(ps).map(p => ({ ...p, morale }));
      return createMatchState(withMorale(teamRedPlayers, 100), f433, withMorale(teamBluePlayers, 20), f433);
    },
  },

  {
    id:          'inverted-fullbacks',
    name:        '11v11 — Inverted full-backs',
    description: 'Team A full-backs on the "Inverted" role variant (player instructions): they tuck into midfield (+14 yds toward the centre) when A has the ball. Turn on the Instructions overlay for the tags and compare the LB/RB width with Team B (default).',
    createState() {
      const f433 = formation433Json as Formation;
      const base = createMatchState(freshRoster(teamRedPlayers), f433, freshRoster(teamBluePlayers), f433);
      const list = f433.attacking.map(s => (s.role === 'LB' || s.role === 'RB' ? { variant: 'fb_inverted' as const } : null));
      return applyTeamInstructions(base, 'A', list);
    },
  },

  {
    id:          'target-man',
    name:        '11v11 — Target man',
    description: 'Team A striker on the "Target man" variant (holds his position, offers to receive, the team routes passes to him): select him to see the resolved tuning in the Decision panel. (The false 9 was cut in calibration — see player-instructions.md.)',
    createState() {
      const f433 = formation433Json as Formation;
      const base = createMatchState(freshRoster(teamRedPlayers), f433, freshRoster(teamBluePlayers), f433);
      const list = f433.attacking.map(s => (s.role === 'ST' ? { variant: 'st_target' as const } : null));
      return applyTeamInstructions(base, 'A', list);
    },
  },

  {
    id:          'man-mark-star',
    name:        '11v11 — Man-marking the star',
    description: 'The first central midfielder of Team B man-marks the Team A striker (dashed line + ring with the Instructions overlay). The marker follows him across the pitch while B defends and plays his own role when B has the ball.',
    createState() {
      const f433 = formation433Json as Formation;
      const base = createMatchState(freshRoster(teamRedPlayers), f433, freshRoster(teamBluePlayers), f433);
      const cmSlot = f433.attacking.findIndex(s => s.role === 'CM');
      const stSlot = f433.attacking.findIndex(s => s.role === 'ST');
      return setManMarksBySlot(base, 'B', [{ slot: cmSlot, targetSlot: stSlot }]);
    },
  },

  {
    id:          'injury-demo',
    name:        '11v11 — Injury Demo',
    description: 'Forces an injury on Team A\'s first outfield player at kickoff (via forceInjurySubstitution) so the forced substitution, the on-screen injury notice, and the "injury" debug log category can be observed immediately.',
    createState() {
      const f433 = formation433Json as Formation;
      const base = createMatchState(freshRoster(teamRedPlayers), f433, freshRoster(teamBluePlayers), f433);
      const target = base.players.find(p => p.team === 'A' && p.role !== 'GK');
      if (!target) return base;
      return forceInjurySubstitution(base, target, 1, 'severe');
    },
  },

  {
    id:          'foul-in-box',
    name:        '11v11 — Foul in the Box (penalty)',
    description: 'Team B CB tackles Team A ST from behind inside the Team B box. The foul is forced (maybeFoul with a fixed roll): a yellow card and a penalty, resolved with penaltyChance when the 2-second freeze ends. Watch the "foul" and "card" debug log categories and the FL/YC/PEN columns.',
    createState() {
      const f433 = formation433Json as Formation;
      const base = createMatchState(freshRoster(teamRedPlayers), f433, freshRoster(teamBluePlayers), f433);
      const st = base.players.find(p => p.team === 'A' && p.role === 'ST');
      const cb = base.players.find(p => p.team === 'B' && p.role === 'CB');
      if (!st || !cb) return base;
      const goalX = st.attackDir === 1 ? PITCH_LENGTH : 0;
      const x = goalX - st.attackDir * 10;
      const placed: GameState = {
        ...base,
        setPiece: null,
        ballHolderId: st.id,
        players: base.players.map(p =>
          p.id === st.id ? { ...p, x, y: 37 } :
          p.id === cb.id ? { ...p, x: x - st.attackDir * 1.5, y: 37 } : p),
      };
      // Rolls: foul (0 < chance), no straight red (0.99), yellow (0).
      const rolls = [0, 0.99, 0];
      let i = 0;
      const fouled = maybeFoul(placed, placed.players.find(p => p.id === cb.id)!, placed.players.find(p => p.id === st.id)!, 'tackle', false, () => rolls[i++] ?? 0.5);
      return fouled ?? placed;
    },
  },

  {
    id:          'corner-attack',
    name:        '11v11 — Corner (box layout)',
    description: 'Team A corner from the left flag: the two best aerial defenders, the centre-forward and the next best headers go up, a midfielder waits on the edge of the box, a short option by the flag; Team B marks every attacker goal-side, a man on the near post, its fastest forward left up. Turn on the "Set pieces" overlay to see the delivery options (near post / penalty spot / far post / short) and the "setPiece" / "aerial" debug log.',
    createState() {
      const f433 = formation433Json as Formation;
      const base = createMatchState(freshRoster(teamRedPlayers), f433, freshRoster(teamBluePlayers), f433);
      const a = base.players.find(p => p.team === 'A')!;
      const goalX = a.attackDir === 1 ? PITCH_LENGTH : 0;
      return awardCorner({ ...base, setPiece: null }, 'A', { x: goalX, y: 0 }, a.id, 'clearance', 'other').state;
    },
  },

  {
    id:          'direct-free-kick',
    name:        '11v11 — Direct Free Kick (wall)',
    description: 'Team B CB fouls Team A ST 22 yards out, central (forced foul, no card): a direct free kick by the Team A free-kick taker over a 2–5 man wall 10 yards from the ball. The "Set pieces" overlay draws the wall and the line to goal; the "setPiece" debug log shows the xG and whether it struck the wall (rebound = loose ball).',
    createState() {
      const f433 = formation433Json as Formation;
      const base = createMatchState(freshRoster(teamRedPlayers), f433, freshRoster(teamBluePlayers), f433);
      const st = base.players.find(p => p.team === 'A' && p.role === 'ST');
      const cb = base.players.find(p => p.team === 'B' && p.role === 'CB');
      if (!st || !cb) return base;
      const goalX = st.attackDir === 1 ? PITCH_LENGTH : 0;
      const x = goalX - st.attackDir * 22;
      const placed: GameState = {
        ...base,
        setPiece: null,
        ballHolderId: st.id,
        players: base.players.map(p =>
          p.id === st.id ? { ...p, x, y: 37 } :
          p.id === cb.id ? { ...p, x: x - st.attackDir * 1.5, y: 37 } : p),
      };
      // Rolls: foul (0 < chance), no straight red (0.99), no yellow (0.99).
      const rolls = [0, 0.99, 0.99];
      let i = 0;
      const fouled = maybeFoul(placed, placed.players.find(p => p.id === cb.id)!, placed.players.find(p => p.id === st.id)!, 'tackle', false, () => rolls[i++] ?? 0.5);
      return fouled ?? placed;
    },
  },

  {
    id:          'orphan-loose-ball',
    name:        '11v11 — Orphan Loose Ball (#36)',
    description: 'A resting loose ball in Team A defensive corner with NOBODY committed to chase it (as after a chaser leaves injured). Watch the engine re-commit chasers ("throughBall" debug log) — and, if nobody can arrive, the watchdog award it to the nearest player.',
    createState() {
      const f433 = formation433Json as Formation;
      const base = createMatchState(freshRoster(teamRedPlayers), f433, freshRoster(teamBluePlayers), f433);
      const passer = base.players.find(p => p.team === 'A' && p.role !== 'GK')!;
      return {
        ...base,
        kickoffCountdown: 0,
        setPiece: null,
        players: base.players.map(p => ({ ...p, decisionMemory: EMPTY_DECISION_MEMORY })),
        looseBall: {
          x: 20, y: 60, vx: 0, vy: 0,
          startTime: base.matchTime,
          fromPasserId: passer.id,
          fromTeamLastTouch: 'A',
          intendedRunnerId: null,
          receiverOffside: false,
        },
      };
    },
  },
];

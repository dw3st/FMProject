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

import { createMatchState } from '@/GameEngine/Domain/gameState';
import playersJson from '@/Data/players.json';
import formation433Json from '@/Data/formations/4-3-3.json';
import type { PlayerStatsRecord, RosterPlayer } from '@/types/playerTypes';

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

export const TEST_SCENARIOS: TestScenario[] = [
  {
    id:          '11v11-classic',
    name:        '11v11 — Classic Match',
    description: 'Full 11v11 using the original team_red vs team_blue test roster in a 4-3-3.',
    createState() {
      const f433 = formation433Json as Formation;
      return createMatchState(teamRedPlayers, f433, teamBluePlayers, f433);
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
];

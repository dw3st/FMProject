#!/usr/bin/env bun
/**
 * FMProject Engine MCP Server
 *
 * Stdio MCP server that loads a debug snapshot (produced by TestScreen → POST
 * /api/debug/snapshot) and exposes engine scoring functions as tools so an LLM
 * can ask "why did player X choose Y?" without re-running the game.
 *
 * Run: bun src/mcp/server.ts
 *
 * Tools take `snapshotPath` as the first arg. Paths can be absolute or relative
 * to the project root.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { resolve } from 'node:path';

import { loadSnapshot } from '@/mcp/loadState';
import {
  queryAllPasses,
  queryPass,
  queryCarryLanes,
  queryDefensiveIntent,
  queryOffBall,
  queryShot,
  queryGKQuality,
  queryInterceptionCorridors,
  queryThroughBallCells,
  querySummary,
} from '@/mcp/queries';

const PROJECT_ROOT = resolve(import.meta.dir, '../..');

function resolvePath(p: string): string {
  if (p.startsWith('/')) return p;
  return resolve(PROJECT_ROOT, p);
}

function jsonResult(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

function errorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true,
    content: [{ type: 'text' as const, text: `Error: ${message}` }],
  };
}

async function withSnapshot<T>(
  snapshotPath: string,
  fn: (snap: Awaited<ReturnType<typeof loadSnapshot>>) => T,
) {
  try {
    const snap   = await loadSnapshot(resolvePath(snapshotPath));
    const result = fn(snap);
    return jsonResult(result);
  } catch (e) {
    return errorResult(e);
  }
}

const server = new McpServer({
  name: 'fmproject-engine',
  version: '0.1.0',
});

// ── summary ───────────────────────────────────────────────────────────────────

server.registerTool(
  'summary',
  {
    description:
      'Snapshot overview: match time, score, ball holder, set-piece state, and a roster of all 22 players (id/name/team/role/x/y). Always start here to find player IDs for other tools.',
    inputSchema: {
      snapshotPath: z.string().describe('Path to the debug snapshot JSON file (e.g. "debug/2026-04-29T14-15-45-938Z.json")'),
    },
  },
  ({ snapshotPath }) => withSnapshot(snapshotPath, snap => querySummary(snap.state)),
);

// ── pass scoring ──────────────────────────────────────────────────────────────

server.registerTool(
  'evaluate_all_passes',
  {
    description:
      'Score every possible pass from the current ball holder to all teammates. Returns sorted list with score, distance, and `open` flag (score ≥ MIN_PASS_SCORE). Use this to see why the engine picked a specific pass.',
    inputSchema: {
      snapshotPath: z.string(),
    },
  },
  ({ snapshotPath }) => withSnapshot(snapshotPath, snap => queryAllPasses(snap.state)),
);

server.registerTool(
  'score_pass',
  {
    description:
      'Score a single pass from the ball holder to a specific receiver, returning the final score and whether it would be selected (open).',
    inputSchema: {
      snapshotPath: z.string(),
      receiverId:   z.number().int().describe('Engine player ID of the intended receiver (must be a teammate of the ball holder).'),
    },
  },
  ({ snapshotPath, receiverId }) => withSnapshot(snapshotPath, snap => queryPass(snap.state, receiverId)),
);

// ── carry lanes ───────────────────────────────────────────────────────────────

server.registerTool(
  'evaluate_carry',
  {
    description:
      'Score the three carry lanes (forward / forward-left ±30° / forward-right ±30°) for the current ball holder. Returns each lane\'s direction, target position, and total score, plus the team\'s build_up tactic and the MIN_TOTAL_SCORE threshold.',
    inputSchema: {
      snapshotPath: z.string(),
    },
  },
  ({ snapshotPath }) => withSnapshot(snapshotPath, snap => queryCarryLanes(snap.state)),
);

// ── defensive intent ──────────────────────────────────────────────────────────

server.registerTool(
  'score_defensive_intent',
  {
    description:
      'Re-run defensive intent evaluation for a defender. Returns the chosen decision plus the player\'s stored defensiveScores breakdown from the snapshot (hold_shape / track_mark / press_holder / step_into_carry_lane scores, holder/mark threat, carry-lane bonus).',
    inputSchema: {
      snapshotPath: z.string(),
      defenderId:   z.number().int().describe('Engine player ID of the defender (must be on the team NOT holding the ball).'),
    },
  },
  ({ snapshotPath, defenderId }) =>
    withSnapshot(snapshotPath, snap => queryDefensiveIntent(snap.state, defenderId, snap.storedScores)),
);

// ── off-ball ──────────────────────────────────────────────────────────────────

server.registerTool(
  'score_off_ball',
  {
    description:
      'Re-run off-ball movement evaluation for an attacking player (not the ball holder). Returns the chosen decision plus the stored offBallScores breakdown (intent scores: offer_support / hold_space / make_run).',
    inputSchema: {
      snapshotPath: z.string(),
      playerId:     z.number().int().describe('Engine player ID (must be on the attacking team and not the ball holder).'),
    },
  },
  ({ snapshotPath, playerId }) =>
    withSnapshot(snapshotPath, snap => queryOffBall(snap.state, playerId, snap.storedScores)),
);

// ── shot / xG ─────────────────────────────────────────────────────────────────

server.registerTool(
  'evaluate_shot',
  {
    description:
      'Compute xG breakdown for a hypothetical shot: distance, open angle to goal, weighted defender pressure, xG, shooter effect, GK effect, and final goalChance. Use opts.fromX/fromY to evaluate a hypothetical shooter position; defaults to the player\'s current location.',
    inputSchema: {
      snapshotPath: z.string(),
      shooterId:    z.number().int(),
      fromX:        z.number().optional().describe('Hypothetical shot origin X (yards). Defaults to the player\'s current x.'),
      fromY:        z.number().optional().describe('Hypothetical shot origin Y (yards). Defaults to the player\'s current y.'),
    },
  },
  ({ snapshotPath, shooterId, fromX, fromY }) =>
    withSnapshot(snapshotPath, snap => queryShot(snap.state, shooterId, { fromX, fromY })),
);

server.registerTool(
  'gk_position_quality',
  {
    description:
      'Measure how well a GK is positioned on the optimal angle-bisector arc relative to the ball position (0 = far off arc, 1 = perfectly placed). Used inside computeGKEffect to scale the positioning component.',
    inputSchema: {
      snapshotPath: z.string(),
      gkId:         z.number().int().describe('Engine player ID of the GK.'),
    },
  },
  ({ snapshotPath, gkId }) =>
    withSnapshot(snapshotPath, snap => queryGKQuality(snap.state, gkId)),
);

// ── through-ball cells ──────────────────────────────────────────────────────────

server.registerTool(
  'evaluate_through_ball',
  {
    description:
      'Score the through-ball candidate cells for the current ball holder. Returns the holder, the viability weights (W_RACE/W_SPACE/W_SKILL/W_PATH/W_LANE_RISK/W_OFFSIDE) plus the multiplicative GOAL_THREAT_BUFF, and the top-N cells sorted by score with their full component breakdown (race / space / goal / skill / path / laneRisk / offsideRisk), the race margin, and the best attacker/defender (id, name, ETA) racing to each cell. Score = viability × (1 + GOAL_THREAT_BUFF × goal), so goal threat lifts cells rather than penalising bad angles. Use this to see why a through ball targets a particular spot. Returns empty cells if a pass/shot is already in flight or the holder is a GK.',
    inputSchema: {
      snapshotPath: z.string(),
      limit:        z.number().int().optional().describe('Max number of top-scoring cells to return (default 15).'),
    },
  },
  ({ snapshotPath, limit }) => withSnapshot(snapshotPath, snap => queryThroughBallCells(snap.state, limit)),
);

// ── interception corridors ────────────────────────────────────────────────────

server.registerTool(
  'interception_corridors',
  {
    description:
      'List the interception corridor (yards) of each defender, derived from speed + acceleration. Higher speed/accel = wider lane to reach a passing line. Sorted by corridor descending.',
    inputSchema: {
      snapshotPath: z.string(),
    },
  },
  ({ snapshotPath }) => withSnapshot(snapshotPath, snap => queryInterceptionCorridors(snap.state)),
);

// ── boot ──────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);

export type TeamId = 'A' | 'B';
export type PlayerRole = 'GK' | 'LB' | 'CB' | 'RB' | 'LWB' | 'RWB' | 'CDM' | 'CM' | 'CAM' | 'LM' | 'RM' | 'LW' | 'RW' | 'ST';
export type Phase = 'attacking' | 'defending';

/**
 * Team intent — a transient, scoring-bias signal layered on top of the static
 * tactical style. Recomputed on possession transfer AND every few game-seconds
 * during a possession. Applied as multipliers to pass / carry / shoot / off-ball
 * scoring AND as overrides on defensive tactic keys (e.g. pressing_style).
 *
 * Intents are general MECHANICS — any tactic *can* fire any intent. The tactic
 * just shifts how often each intent is rolled out (long-term goal). For now,
 * gating is tactic-scoped because we are only balancing the counter_attack
 * tactic — other tactics will gain access to these intents incrementally.
 *
 * Exactly ONE intent is active per team at any moment. A team has the ball OR
 * doesn't, so offensive intents (e.g. `counter_attack`) and defensive intents
 * (e.g. `hold_shape`, `press_now`) never need to coexist on the same team.
 *
 * `balanced` is the default and means "no override — use raw tactic weights".
 * Add new intents by extending this union and adding an entry in IntentConfig.
 *
 *   counter_attack — OFFENSIVE: long forward passes, forward carries, aggressive
 *                    runs. Fires when team has ball and opponent has committed
 *                    many players forward.
 *   switch_play    — OFFENSIVE: damp forward carry/pass pull and reward a lateral
 *                    transition toward the far (opposite) touchline. Fires
 *                    probabilistically when the holder receives wide AND the far
 *                    flank is open — soft bias, so a wide-open forward lane can
 *                    still win. The per-possession roll keeps it from triggering
 *                    on every wide reception, creating play variety.
 *   hold_shape     — DEFENSIVE: stay compact in a low line, conserve energy.
 *                    Default defending state for the counter_attack tactic.
 *                    No pressing-style change today — the static low_block
 *                    already does the right thing; this intent simply marks
 *                    the "we are deliberately holding shape" state so future
 *                    iterations can layer on stricter shape behaviour.
 *   press_now      — DEFENSIVE: upgrade pressing to high_press, commit
 *                    tackles. Fires when the structured defense is in place
 *                    AND attackers have progressed into our half AND we have
 *                    a numerical advantage to swarm the ball.
 */
export type TeamIntent = 'balanced' | 'counter_attack' | 'switch_play' | 'hold_shape' | 'press_now';

// ── Formation types ───────────────────────────────────────────────────────────

/** One slot in a formation shape: the role that occupies it, with absolute field position. */
export interface FormationSlotDef {
  role: PlayerRole;
  /** Absolute X in yards (Team A reference; Team B is mirrored). */
  x: number;
  /** Absolute Y in yards from top touchline. */
  y: number;
  /**
   * Optional tactical Y range override (half-width of lateral corridor from slot Y).
   * Falls back to the role's yRange from roles.json engine block when omitted.
   */
  yRange?: number;
}

/** A full formation with separate attacking and defending shapes. Each array has exactly 11 entries. */
export interface Formation {
  id: string;
  attacking: FormationSlotDef[];
  defending: FormationSlotDef[];
}

/** High-level match state machine. Controls simulation gating and clock display. */
export type MatchPhase = 'preMatch' | 'firstHalf' | 'halfTime' | 'secondHalf' | 'matchEnd';

// ── Set pieces ────────────────────────────────────────────────────────────────

/** Restart types currently modelled as a set-piece freeze. */
export type SetPieceType =
  | 'kickoff'
  | 'offside_fk'
  | 'goal_kick'
  /** Awarded when the ball goes over a touchline. The taker plays from the sideline. */
  | 'throw_in'
  /** Awarded when a defender's team puts the ball over their own goal line. Taken from the corner flag on the side the ball went out. */
  | 'corner';

/**
 * Active set-piece freeze. When non-null the engine is waiting for players to
 * settle into their set-piece layout; during this window the taker cannot
 * carry — they must pass.
 */
export interface SetPiece {
  type:      SetPieceType;
  /** Engine player ID of the player restarting play. */
  takerId:   number;
  /** Real-seconds remaining until the set piece becomes live (reaches 0). */
  countdown: number;
  /** Optional ball location for restarts that happen away from centre (offside). */
  position?: { x: number; y: number };
}

// ── Player stats ────────────────────────────────────────────────────────────

/** Stats that govern decisions when this player has the ball. */
export interface WithBallStats {
  /** 0..1 — shot accuracy spread factor (1 = tight, 0 = wild). */
  shootAccuracy: number;
  /** Yards/second when carrying the ball forward. */
  carrySpeed: number;
  /** Yards ahead scanned when evaluating forward carry lanes. */
  carryVision: number;
  /** 0..1 — per-reconsider probability of continuing a carry vs switching to pass. */
  /** 0..1 normalised speed — improves value of open forward carry lanes. */
  speed: number;
  /** 0..1 normalised acceleration — helps beat close defenders in short bursts. */
  acceleration: number;
  /** 0..1 normalised passing skill — execution quality and range. */
  passingSkill: number;
  /** 0..1 normalised vision — ability to identify the best passing option. */
  vision: number;
  /** 0..1 normalised first touch — ball control quality when receiving. */
  firstTouch: number;
  /** 0..1 normalised dribbling — used in 1v1 dribble resolution. */
  dribbling: number;
  /** 0..1 normalised physical strength — resists pressure when shooting. */
  strength: number;
}

/** Carry lane score breakdown — returned by evaluateCarryLane for debugging / tuning. */
export interface CarryLaneScore {
  dirX: number; dirY: number;
  targetX: number; targetY: number;
  clearanceScore: number;
  progressScore: number;
  angleScore: number;
  crowdPenalty: number;
  roleBias: number;
  speedBonus: number;
  accelerationBonus: number;
  visionBonus: number;
  pressurePenalty: number;
  baseScore: number;
  totalScore: number;
}

/** Stats that govern decisions when this player does NOT have the ball. */
export interface WithoutBallStats {
  /** Base yards for press intent; team pressing_style adds ±4 in defensive positioning. */
  pressRange: number;
  /** Base sprint speed in yards/second while pressing (before acceleration burst). */
  pressSpeed: number;
  /** 0..1 normalised speed — raw top speed off the ball. */
  speed: number;
  /** 0..1 normalised acceleration — burst ability when closing on the ball holder. */
  acceleration: number;
  /** 0..1 probability that a tackle attempt succeeds. */
  tackleChance: number;
  /** 0..1 floorless tackling skill (raw tackling / 10). Used for symmetric 1v1 dribble scaling
   *  so a weak defender scales toward zero, unlike tackleChance which carries a +0.1 offset. */
  tackling: number;
  /** 0..1 probability of intercepting a pass in flight (driven by pressing + vision). */
  interceptionChance: number;
  // GK-specific (0 for non-GKs)
  /** 0..1 — being in the correct place before the shot arrives. */
  gkPositioning: number;
  /** 0..1 — reacting to close-range shots. */
  gkReflex: number;
  /** 0..1 — reaching shots far from current position. */
  gkDiving: number;
  /** 0..1 normalised physical strength — how much pressure this defender applies when close. */
  strength: number;
}

export interface PlayerStats {
  withBall: WithBallStats;
  withoutBall: WithoutBallStats;
}

// ── Movement bounds ───────────────────────────────────────────────────────────

export interface MovementBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

// ── Core entities ────────────────────────────────────────────────────────────

/** One entry in the match substitution log. */
export interface SubstitutionRecord {
  team: TeamId;
  /** Engine player ID of the player leaving the pitch. */
  playerOutId: number;
  playerOutName: string;
  /** Roster player ID of the player leaving the pitch. */
  playerOutRosterId: string;
  /** Energy (0–100) of the outgoing player at the moment of substitution. */
  playerOutEnergy: number;
  /** Engine player ID of the player entering the pitch. */
  playerInId: number;
  playerInName: string;
  /** Roster player ID of the player entering the pitch. */
  playerInRosterId: string;
  /** Game-minute when the substitution was made. */
  matchMinute: number;
}

/** A queued substitution that will execute at the next dead-ball moment. */
export interface PendingSub {
  /** Engine player ID to remove from the pitch. */
  outId: number;
  /** Engine player ID to bring on from the bench. */
  inId: number;
}

export interface GamePlayer {
  id: number;
  /** Roster player ID — links back to the squad JSON. */
  rosterId: string;
  name: string;
  team: TeamId;
  role: PlayerRole;
  /**
   * Attack direction: +1 = toward x=PITCH_LENGTH (right goal), -1 = toward x=0 (left goal).
   * Flips at half-time when sides switch — do NOT use `team` for direction logic.
   */
  attackDir: 1 | -1;
  /** Yards from the left goal line (0 = left goal line, 115 = right goal line) */
  x: number;
  /** Yards from the top touchline (0 = top, 74 = bottom) */
  y: number;
  /** Static output of `teamLineup()` — recomputed only when the lineup is built, not each tick. */
  baseStats: PlayerStats;
  /** Effective stats after fatigue; the engine must use this for all in-match behaviour. */
  runtimeStats: PlayerStats;
  /** Current stamina reserve 0–100; drained by actions each tick. */
  energy: number;
  /** Energy at match kick-off — used to calculate half-time recovery. */
  startEnergy: number;
  /** Roster stamina attribute (0–10 scale) — reduces energy cost in `consumeEnergy`. */
  stamina: number;
  /** 0..1 — how much this role tracks the ball's Y position (from roles.json engine block). */
  ballSupportScale: number;
  /** Index into the formation's slot arrays — stable for the entire match. */
  slotIndex: number;
  /** Attacking slot position in absolute coords (used for kickoff reset only). Mirrored for Team B. */
  basePosition: { x: number; y: number };
  /** Computed each tick — where this player is trying to reach */
  targetPosition: { x: number; y: number };
  /** Movement bounds set once at creation (already mirrored for Team B) */
  bounds: MovementBounds;
  /**
   * Seconds remaining on post-tackle recovery debuff.
   * Movement speed is multiplied by TACKLE_RECOVERY_SPEED_FACTOR while > 0.
   * Set on both the tackler (winner / failed) and the tackled player (loser).
   */
  recoveryTime: number;
  /**
   * Ticks remaining on the post-reception burst window (~0.8 s at 5 ticks/s).
   * Set to 4 when the player receives a pass. Each tick decrements by 1.
   * While > 0 and an opponent is within 6 yards, the receiver bursts away to create space.
   */
  justReceivedTicks: number;
  /** Short-term decision memory — prevents re-deciding every tick for stable decisions. */
  decisionMemory: import('./Domain/DecisionTree').DecisionMemory;
}

/**
 * Pass kind discriminator.
 *   'regular' — pass to a teammate's feet; on landing the named receiver collects.
 *   'through' — pass into space (a cell). On landing, possession is contested
 *               (Phase 3: nearest player picks up; Phase 5: sprint race + duel).
 */
export type PassKind = 'regular' | 'through';

export interface PassState {
  fromId: number;
  /**
   * Receiver player ID. ALWAYS set for regular passes; ALWAYS null for through balls
   * (the ball goes to a position, not a player). Use `kind` to discriminate.
   */
  toId: number | null;
  /**
   * Target position — always set for both kinds.
   * Regular pass: snapshotted from the receiver's position at kick time.
   * Through ball: the target cell centre (with optional Gaussian error).
   */
  toX: number;
  toY: number;
  /** 'regular' | 'through' — see PassKind. */
  kind: PassKind;
  /** 0..1 interpolation progress */
  t: number;
  /** Straight-line distance in yards from passer to target at kick moment. */
  distance: number;
  /**
   * Whether the receiver was in an offside position at the moment the pass was played.
   * For regular passes: the named receiver. For through balls: the intended runner.
   * Checked at completion; enforcement occurs only when an offside player touches the ball.
   */
  receiverOffside: boolean;
  /**
   * Through balls only — the attacker the holder *targeted* with the cell pick.
   * This player is informational; the engine does NOT force them to receive — whoever
   * arrives first wins the loose ball (Phase 5). Null for regular passes.
   */
  intendedRunnerId: number | null;
}

/**
 * Loose-ball state — ball drifting in space after a through ball lands. The ball
 * carries small residual velocity (friction-decayed each tick) so it never
 * appears frozen, and persists until either:
 *   • a player reaches it (within LOOSE_BALL_TOUCH_RADIUS), or
 *   • it crosses a pitch boundary (awarded to the opposing team), or
 *   • velocity reaches zero and a player eventually arrives.
 *
 * `state.pass` is null during this phase. `ballHolderId` continues to reference
 * the last toucher (the passer) for stat attribution and team-with-ball checks.
 */
export interface LooseBallState {
  /** Where the ball is right now (yards). Updated each tick when velocity > 0. */
  x: number;
  y: number;
  /** Current velocity in yards per real-second. Decays via LOOSE_BALL_DECELERATION until 0. */
  vx: number;
  vy: number;
  /** Match-time (game seconds) when the ball became loose. */
  startTime: number;
  /** Engine ID of the passer who played the through ball — for stat attribution. */
  fromPasserId: number;
  /** Team that played the through ball — needed for through-ball-lost vs through-ball-completed accounting. */
  fromTeamLastTouch: TeamId;
  /** The runner the passer targeted at decision time (informational). */
  intendedRunnerId: number | null;
  /** Snapshot of intended runner's offside status at kick time. Enforced if the intended runner picks up. */
  receiverOffside: boolean;
}

export interface ShotState {
  shooterId: number;
  fromX: number;
  fromY: number;
  /** Target x on the goal line */
  toX: number;
  /** Target y — where the ball aims between the posts */
  toY: number;
  /** 0..1 flight progress */
  t: number;
  /** Base shot quality (expected goals) — distance, angle, pressure only. */
  xg: number;
}

export interface GameState {
  players: GamePlayer[];
  /** Bench players for Team A — waiting to come on. */
  benchA: GamePlayer[];
  /** Bench players for Team B — waiting to come on. */
  benchB: GamePlayer[];
  /** Completed substitutions this match, in chronological order. */
  substitutions: SubstitutionRecord[];
  /** Substitutions remaining for Team A (starts at 5). */
  subsRemainingA: number;
  /** Substitutions remaining for Team B (starts at 5). */
  subsRemainingB: number;
  /** Subs queued by Team A, executed at next dead-ball moment. */
  pendingSubsA: PendingSub[];
  /** Subs queued by Team B, executed at next dead-ball moment. */
  pendingSubsB: PendingSub[];
  /** Formation used by Team A — kept on state so Positioning can access slot data each tick. */
  formationA: Formation;
  /** Formation used by Team B. */
  formationB: Formation;
  /** ID of the player currently holding the ball (or who last held it during a pass) */
  ballHolderId: number;
  /** Active pass in flight; null when ball is held */
  pass: PassState | null;
  /** Active shot in flight; null when not shooting */
  shot: ShotState | null;
  /**
   * Loose ball sitting in space (after a through ball lands and before a player
   * arrives to collect). Mutually exclusive with `pass` and `shot`. While
   * non-null, no team has true possession — `ballHolderId` references the last
   * toucher only.
   */
  looseBall: LooseBallState | null;
  score: { A: number; B: number };
  /** Seconds until the next tackle window opens (global cooldown) */
  tackleCooldown: number;
  /**
   * Active set-piece freeze (kickoff / offside_fk / goal_kick). Null when play is live.
   * Replaces the old bare `kickoffCountdown: number`. See `SetPiece` above.
   */
  setPiece: SetPiece | null;
  /** Per-player decisions computed by the game loop each tick */
  decisions: Record<number, import('./Domain/DecisionTree').PlayerDecision>;
  /**
   * Engine player ID of the player who last completed a pass to the current ball holder.
   * Used to attribute assists: when the holder scores, this player gets the assist.
   * Cleared on kickoff (goal or half-time).
   */
  lastPasserId: number | null;

  // ── Match flow ─────────────────────────────────────────────────────────────
  matchPhase: MatchPhase;
  /** Game-seconds elapsed this half (advances at TIME_SCALE × real-time). */
  matchTime: number;
  /** Extra game-seconds (stoppage time) for first half — set once at match start. */
  extraTimeFirst: number;
  /** Extra game-seconds (stoppage time) for second half — set once at match start. */
  extraTimeSecond: number;
  /** Real-seconds remaining in a presentation freeze (preMatch / halfTime). */
  presentationCountdown: number;
  /** Seconds the current possessing team has held the ball continuously. Resets on possession change. */
  possessionTime: number;
  /** When true, automatic half-time and match-end phase transitions are suppressed (used by the test screen). */
  testMode?: boolean;
  /**
   * Per-team transient scoring intent. Recomputed on every possession transfer
   * (team change) AND on a periodic tick while possession persists. Drives
   * multiplier overlays in pass / carry / shoot / off-ball scoring AND
   * defensive pressing-style overrides via IntentConfig. Default `balanced`
   * for both teams.
   */
  teamIntent: { A: TeamIntent; B: TeamIntent };
  /**
   * Match-time (seconds) of the last intent re-evaluation tick. Used by the
   * periodic recompute to fire roughly every INTENT_REEVAL_INTERVAL seconds —
   * possession-transfer recompute also bumps this so we don't immediately
   * re-evaluate after a turnover.
   */
  lastIntentEvalTime?: number;

  /**
   * Cached through-ball candidate cells for the current ball holder. Refreshed
   * every TB_CACHE_REFRESH_TICKS ticks while the same player holds the ball
   * (race-margin and path-clearness signals shift slowly), invalidated on
   * holder change. The decision tree reuses these cells without re-running the
   * full grid enumeration each tick.
   *
   * `ticksSinceRefresh` counts how many ticks have elapsed since the cells were
   * computed. When it reaches the refresh threshold, the next tick recomputes.
   */
  throughBallCellsCache: {
    holderId: number;
    ticksSinceRefresh: number;
    cells: import('./Domain/ThroughBallCells').CandidateCell[];
  } | null;
}

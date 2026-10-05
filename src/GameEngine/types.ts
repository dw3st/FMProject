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
export type MatchPhase =
  | 'preMatch' | 'firstHalf' | 'halfTime' | 'secondHalf'
  | 'extraTimeBreak' | 'extraTimeFirst' | 'extraTimeSecond' | 'penalties'
  | 'matchEnd';

/** One kick of a penalty shootout, in engine ids. */
interface ShootoutKick {
  team: TeamId;
  takerId: number;
  keeperId: number | null;
  scored: boolean;
  chance: number;
}

/** Shootout resolved up front (`resolvePenaltyShootout`) and presented kick by kick. */
export interface ShootoutState {
  kicks: ShootoutKick[];
  /** Score of the kicks already presented. */
  score: { A: number; B: number };
  /** Score once every kick is presented. */
  finalScore: { A: number; B: number };
  winner: TeamId;
  /** How many kicks have been presented. */
  shown: number;
}

/** How a knockout match was decided after regulation (engine sides). */
export interface KnockoutDecider {
  /** Goals scored in extra time only. */
  extraTime: { A: number; B: number };
  penalties: { A: number; B: number } | null;
  winner: TeamId;
}

// ── Set pieces ────────────────────────────────────────────────────────────────

/** Restart types currently modelled as a set-piece freeze. */
type SetPieceType =
  | 'kickoff'
  | 'offside_fk'
  | 'goal_kick'
  /** Awarded when the ball goes over a touchline. The taker plays from the sideline. */
  | 'throw_in'
  /** Awarded when a defender's team puts the ball over their own goal line. Taken from the corner flag on the side the ball went out. */
  | 'corner'
  /** Foul outside the offender's penalty area — taken from the foul spot (`.claude/rules/game-engine/fouls.md`). */
  | 'free_kick'
  /** Foul inside the offender's penalty area — resolved with `penaltyChance` when the countdown ends. */
  | 'penalty';

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
  /**
   * Set-piece play (`set-pieces-play.md`): `box` = corner / crossed free kick with both teams in the
   * box layout (the taker crosses or plays short); `direct` = direct free kick at goal over a wall.
   * Absent = a plain restart.
   */
  variant?: 'box' | 'direct';
  /** Direct free kick: engine ids of the defenders in the wall. */
  wallIds?: number[];
}

/** What a set-piece goal came from (`GameState.setPiecePhase`, `goalScored.setPiece`). */
export type SetPieceGoalKind = 'corner' | 'free_kick' | 'direct_free_kick' | 'penalty';

/** Manager's set-piece takers (roster ids); absent = automatic (`Domain/SetPieces.pickSetPieceTaker`). */
export interface SetPieceTakers { corners?: string; freeKicks?: string; penalties?: string }

// ── Player stats ────────────────────────────────────────────────────────────

/** Stats that govern decisions when this player has the ball. */
interface WithBallStats {
  /** 0..1 — shot accuracy spread factor (1 = tight, 0 = wild). */
  shootAccuracy: number;
  /** Yards/second when carrying the ball forward. */
  carrySpeed: number;
  /** Yards ahead scanned when evaluating forward carry lanes. */
  carryVision: number;
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

/** Stats that govern decisions when this player does NOT have the ball. */
interface WithoutBallStats {
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
  /** 0..1 normalised heading (roster `heading` / 10) — aerial duels and headers (`aerial.md`). */
  heading: number;
  /** 0..1 normalised jump (roster `jump` / 10) — aerial duels. GK diving reads the same attribute. */
  jump: number;
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
  /**
   * Set to `'fatigue'` when this sub was recommended by `evaluateAiSubstitutions`
   * (AiSubstitution.ts), or `'injury'` when it was forced by `forceInjurySubstitution`
   * (`docs/superpowers/specs/2026-09-28-injuries-design.md` §1 "Na partida") — absent for a
   * manual/tactical substitution. Threaded through to the `playerSubstituted` event so
   * Statistics.ts can count these separately.
   */
  reason?: 'fatigue' | 'injury';
}

/** One entry in the match injury log (`docs/superpowers/specs/2026-09-28-injuries-design.md` §1). */
export interface InjuryRecord {
  team: TeamId;
  /** Engine player ID of the player who got injured. */
  playerId: number;
  playerName: string;
  /** Roster player ID — links back to the squad JSON. */
  playerRosterId: string;
  severity: import('@/Domain/injury/injury').InjurySeverity;
  /** Game-minute when the injury occurred. */
  matchMinute: number;
  /**
   * Energy (0–100) at the moment of injury — needed because a player removed outright (no subs
   * left / no bench candidate) never appears in `GameState.players` again, nor in
   * `substitutions` (that log only covers replaced players), so this is the only place their
   * final in-match energy is recorded (`buildPlayedMatchRecording.ts` / `matches.ts`).
   */
  energy: number;
}

/** One card shown in the match (`docs/superpowers/specs/2026-10-02-fouls-cards-design.md` §3). */
export interface CardRecord {
  team: TeamId;
  /** Engine player ID of the booked player. */
  playerId: number;
  playerName: string;
  /** Roster player ID — links back to the squad JSON. */
  playerRosterId: string;
  card: 'yellow' | 'red';
  /** True when this red is the player's second yellow (the yellow itself is also logged before it). */
  secondYellow: boolean;
  /** Game-minute of the card. */
  matchMinute: number;
  /**
   * Energy (0–100) when booked. A sent-off player leaves the pitch for good (no substitute), so for
   * a red this is the only record of their final in-match energy (same role as `InjuryRecord.energy`).
   */
  energy: number;
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
  /** Buffed roster attributes + per-role aptitude, kept so a substitute can be re-fielded in the slot's role. */
  fit?: { stats: import('@/types/playerTypes').PlayerStatsRecord; aptitudes: Record<string, import('@/Domain/positions/positionConfig').Aptitude> };
  /** Effective stats after fatigue; the engine must use this for all in-match behaviour. */
  runtimeStats: PlayerStats;
  /** Current stamina reserve 0–100; drained by actions each tick. */
  energy: number;
  /** Energy at match kick-off — used to calculate half-time recovery. */
  startEnergy: number;
  /** Roster stamina attribute (0–10 scale) — reduces energy cost in `consumeEnergy`. */
  stamina: number;
  /**
   * In-match energy-cost multiplier from `seasonLog.load` (`drainMultiplier` in
   * `src/Domain/fitness/fitness.ts`, see `docs/superpowers/specs/2026-09-27-stamina-design.md` §1
   * "Na partida"). 1 = no load penalty, up to 1.25 at `FITNESS.LOAD_HIGH`. Optional so hand-built
   * test players (no season log) default to 1 via `pl.drainMultiplier ?? 1`.
   */
  drainMultiplier?: number;
  /**
   * Energy value at which `runtimeStats` was last recomputed from fatigue. Continuous fatigue
   * recomputes `runtimeStats` when `|energy − fatigueBaselineEnergy| >= 1`, instead of the old
   * "every 10 energy points" step. Optional — absent/undefined is treated as "recompute now"
   * (falls back to the current `energy`, see `RuntimeLineup.ts`).
   */
  fatigueBaselineEnergy?: number;
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
  /**
   * Age in years, at kickoff — fixed for the match. Used by the injury model
   * (`Domain/injury/injury.ts` → `ageInjuryFactor`); not otherwise read by the engine.
   */
  age: number;
  /**
   * Roster `strength` attribute, 0..10 scale (NOT the normalised 0..1 `runtimeStats` value) —
   * fixed for the match. Used by the injury model (`strengthInjuryFactor`).
   */
  strengthAttr: number;
  /**
   * `seasonLog.load` (minutes-equivalent fatigue) at kickoff — fixed for the match. Used by the
   * injury model (`loadInjuryFactor`); distinct from `drainMultiplier`, which scales in-match
   * energy cost from the same source value.
   */
  injuryLoad: number;
  /** Morale this player plays at (`.claude/rules/game/morale.md`); absent = neutral 65. Debug display only. */
  morale?: number;
  /**
   * Temperament t (−1 calm … +1 hot-headed, `.claude/rules/game/personality.md`), or the team
   * override (`PersonalityMatchConfig`). Absent = 0. Scales the foul and card chances.
   */
  temperament?: number;
  /**
   * Fitness-coach multiplier on this player's injury risk (`Domain/staff`), fixed for the match.
   * Absent = 1 (hand-built test players).
   */
  injuryMult?: number;
  /**
   * Engine tuning resolved for this player's slot: the role's `roles.json` tuning + the slot's
   * instruction (`RoleVariantConfig.resolveSlotTuning`). Absent = `roleEngine(role)` (test players,
   * old snapshots); read through `engineOf(player)`.
   */
  engine?: import('./Domain/roleEngineData').RoleEngineTuning;
  /** The slot's effective instruction (role variant / pressing). Absent = default. */
  instruction?: import('@/types/tacticsTypes').SlotInstruction;
  /** Engine id of the opponent this player man-marks (`GameState.manMarks`). Absent = zonal. */
  manMarkTargetId?: number;
}

/** One man-marking pair (`GameState.manMarks`). */
export interface ManMarkPair {
  markerSlot: number;
  markerId:   number;
  targetId:   number;
}

/**
 * Pass kind discriminator.
 *   'regular'   — pass to a teammate's feet; on landing the named receiver collects.
 *   'through'   — pass into space (a cell). On landing, possession is contested
 *                 (Phase 3: nearest player picks up; Phase 5: sprint race + duel).
 *   'cross'     — high ball into the box (`aerial.md`). Not interceptable in flight; contested in
 *                 the air at the landing point (aerial duel / keeper claim / header).
 *   'long_ball' — high ball over the line to a forward or the space behind; landing resolved
 *                 like a cross (aerial duel if contested, else first touch / loose ball).
 *   'clearance' — headed clearance / keeper punch / block: a short high ball away from goal, the
 *                 "second ball" contested where it lands (never counted as a pass or long ball).
 */
export type PassKind = 'regular' | 'through' | 'cross' | 'long_ball' | 'clearance';

/** True for the high-ball kinds resolved in the air at the landing point. */
export function isAerialKind(kind: PassKind): kind is 'cross' | 'long_ball' | 'clearance' {
  return kind === 'cross' || kind === 'long_ball' || kind === 'clearance';
}

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
  /**
   * High balls only (`cross` / `long_ball`): attackers in an offside position at the kick. A player
   * in this list who wins the ball at the landing point is flagged offside.
   */
  aerialOffsideIds?: number[];
  /** High ball played by a set-piece taker (free kick / goal kick): the whistle waits for it to land. */
  fromSetPiece?: boolean;
  /**
   * The set piece's `variant` when it was played from one (`set-pieces-play.md`): only a `box`
   * delivery (corner / crossed free kick with both teams set) gets the set-piece rules in the air.
   */
  setPieceVariant?: 'box' | 'direct';
}

/**
 * What put the ball loose: a through ball (default — through-ball stats), a high ball nobody
 * reached (`cross` / `long_ball`) or a defensive header / keeper punch / block (`clearance`).
 */
export type LooseBallSource = 'through' | 'cross' | 'long_ball' | 'clearance';

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
interface LooseBallState {
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
  /** Origin of the loose ball — absent = 'through'. Only through balls feed the through-ball stats. */
  source?: LooseBallSource;
  /**
   * High balls that dropped loose: attackers of `fromTeamLastTouch` offside at the kick
   * (`PassState.aerialOffsideIds`). One of them collecting the loose ball is flagged offside.
   */
  offsideIds?: number[];
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
  /** A header (`aerial.md`): heading replaces finishing in the resolution. */
  header?: boolean;
  /** A direct free kick (`set-pieces-play.md`): `xg` is the shot's xG before the wall. */
  freeKick?: boolean;
}

export interface GameState {
  players: GamePlayer[];
  /** Bench players for Team A — waiting to come on. */
  benchA: GamePlayer[];
  /** Bench players for Team B — waiting to come on. */
  benchB: GamePlayer[];
  /** Completed substitutions this match, in chronological order. */
  substitutions: SubstitutionRecord[];
  /** In-match injuries, in chronological order (`docs/superpowers/specs/2026-09-28-injuries-design.md` §1). */
  injuries: InjuryRecord[];
  /** Cards shown, in chronological order. A second yellow appears as the yellow followed by a red. */
  cards: CardRecord[];
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
  /** Knockout match: a draw after 90' goes to extra time and penalties. Absent/false = league. */
  knockout?: boolean;
  /** Second leg of a two-legged tie: first-leg goals per side of THIS match. Level = score + aggregate. */
  aggregate?: { A: number; B: number };
  /** Score when the second half ended level in a knockout match (null/absent otherwise). */
  scoreAtRegulation?: { A: number; B: number } | null;
  /** Stoppage game-seconds for each extra-time half (0–2 min), drawn when extra time starts. */
  etStoppageFirst?: number;
  etStoppageSecond?: number;
  /** Penalty shootout in progress / finished. */
  shootout?: ShootoutState | null;
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
   * Manager-chosen set-piece takers per team (roster ids). Absent / unavailable = automatic.
   * The AI never sets this.
   */
  setPieceTakers?: Partial<Record<TeamId, SetPieceTakers>>;
  /**
   * Manager's per-slot instructions per team (index = slot; `player-instructions.md`). Kept so a
   * formation change or a substitute re-resolves the slot's tuning. The AI never sets this.
   */
  slotInstructions?: Partial<Record<TeamId, (import('@/types/tacticsTypes').SlotInstruction | null)[]>>;
  /**
   * Man-marking pairs per team (the marking team's key): the player in `markerSlot` marks the
   * opponent `targetId` (engine id). `markerId` follows the slot across substitutions; a pair whose
   * target left the pitch is dropped. Only applies while the marking team is defending.
   */
  manMarks?: Partial<Record<TeamId, ManMarkPair[]>>;
  /**
   * Open set-piece phase: a goal by `team` before `until` (match-time, game-seconds) counts as a
   * set-piece goal of `kind`. Opened by a corner, a free kick in the attacking third or a penalty;
   * closed when the other team wins the ball, at a kickoff and at half-time.
   */
  setPiecePhase?: { team: TeamId; kind: SetPieceGoalKind; until: number } | null;

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

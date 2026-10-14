import type { PressPromiseKind, PressTone, PressTrigger } from "@/types/pressTypes";

/** Etapa 42. Todas as constantes da imprensa. */
export const PRESS = {
  /** Uma coletiva a cada N dias (título fura). */
  MIN_GAP_DAYS: 7,
  /** Convite pré-jogo N dias antes (ou amanhã se perdeu a janela). */
  PRE_DAYS_BEFORE: 2,
  /** Pós-jogo vale N dias. */
  POST_VALID_DAYS: 3,
  HISTORY: 20,
  /** Reta final: últimas N rodadas do clube, a ≤ M pontos de uma fronteira. */
  RUN_IN_ROUNDS: 3,
  RUN_IN_POINTS: 3,
  HEAVY_DEFEAT_MARGIN: 3,
  WINLESS_STEP: 5,
  UPSET_EXPECTATION: 0.5,
  /** Maior prioridade primeiro. */
  PRIORITY: [
    "title", "promoted", "relegated", "ultimatum", "knockout", "eliminated", "derby",
    "heavy_defeat", "run_in", "winless", "upset_win", "upset_loss",
  ] as PressTrigger[],
  PRE: ["derby", "knockout", "run_in", "ultimatum"] as PressTrigger[],
  /** Gatilhos de fase ruim (para `defend_squad` custar diretoria e para a 3ª resposta do jogo virar `blame_self`). */
  BAD: ["heavy_defeat", "eliminated", "winless", "ultimatum", "relegated", "upset_loss"] as PressTrigger[],
  /** Efeito imediato de cada tom. `squad`/`player` = moral; `board`/`fans` = medidores. */
  TONE: {
    confident:     { squad: 1, board: 0, fans: 1 },
    cautious:      { squad: 0, board: 0, fans: 0 },
    provocative:   { squad: 1, board: -1, fans: 2 },
    blame_self:    { squad: 0, board: -0.5, fans: 1 },
    defend_squad:  { squad: 2, board: 0, fans: 0 },
    demand_squad:  { squad: -2, board: 1, fans: 1 },
    neutral:       { squad: 0, board: 0, fans: 0 },
    praise:        { player: 4, board: 0, fans: 0 },
    criticize:     { player: -4, board: 0, fans: 0 },
    protect:       { player: 2, board: 0, fans: 0 },
    job_confident: { squad: 0, board: 1, fans: 0 },
    ask_signings:  { squad: 0, board: -2, fans: 1 },
    deflect:       { squad: 0, board: 0, fans: 0 },
  } as Record<PressTone, { squad?: number; player?: number; board: number; fans: number }>,
  /** `defend_squad` numa fase ruim. */
  DEFEND_BAD_BOARD: -1,
  /** `criticize` num profissional (`takesDemandWell`). */
  CRITICIZE_PRO: 1,
  IGNORED_BOARD: -1,
  PROMISE_OF: { confident: "win", provocative: "win_bold", job_confident: "objective" } as Partial<Record<PressTone, PressPromiseKind>>,
  PROMISE: {
    win:       { kept: { board: 1, fans: 3 }, draw: { board: 0, fans: -1 }, broken: { board: -2, fans: -4 } },
    win_bold:  { kept: { board: 1, fans: 5 }, draw: { board: 0, fans: -1 }, broken: { board: -2, fans: -6 } },
    objective: { kept: { board: 3, fans: 3 }, draw: { board: 0, fans: 0 }, broken: { board: -4, fans: -4 } },
  } as Record<PressPromiseKind, Record<"kept" | "draw" | "broken", { board: number; fans: number }>>,
  /** Variantes de texto por pergunta e por resposta. */
  VARIANTS: 2,
  /** Tons que viram manchete `press_quote`. */
  QUOTE_TONES: ["provocative", "demand_squad", "criticize", "praise", "ask_signings"] as PressTone[],
} as const;

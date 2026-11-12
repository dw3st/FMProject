/** Etapa 42 — coletivas de imprensa do técnico do jogador. Regra: `.claude/rules/game/press.md`. */

export type PressTrigger =
  | "derby" | "knockout" | "run_in" | "ultimatum"                       // antes do jogo
  | "title" | "promoted" | "relegated" | "heavy_defeat" | "eliminated" | "winless" | "upset_win" | "upset_loss"; // depois

export type PressKind = "pre" | "post";
export type PressTopic = "match" | "squad" | "player" | "job";
export type PressTone =
  | "confident" | "cautious" | "provocative" | "blame_self"
  | "defend_squad" | "demand_squad" | "neutral"
  | "praise" | "criticize" | "protect"
  | "job_confident" | "ask_signings" | "deflect"
  /** Lashing out at the press (10.8): a fourth answer of the match question. */
  | "attack_press";

/** Parâmetros de texto já resolvidos (nomes congelados na criação). */
export interface PressParams {
  opponent?: string;
  opponentId?: string;
  competition?: string;   // slug
  score?: string;         // "3–1", do ponto de vista do clube do jogador
  stage?: string;         // fase de copa/continental
  player?: string;
}

export interface PressAnswer { id: string; key: string; tone: PressTone }
export interface PressQuestion {
  id: string;
  topic: PressTopic;
  key: string;            // chave i18n da pergunta
  params: PressParams;
  playerId?: string;
  answers: PressAnswer[];
}

export interface PressConference {
  id: string;
  trigger: PressTrigger;
  kind: PressKind;
  date: string;           // dia do convite
  expires: string;        // última data em que pode ser respondida (vale até o FIM deste dia); pré-jogo = véspera do jogo
  fixtureId?: string;     // jogo de referência (pré: o jogo que vem; pós: o jogo que passou)
  params: PressParams;
  questions: PressQuestion[];
}

export type PressPromiseKind = "win" | "win_bold" | "objective";
export interface PressPromise {
  id: string;
  kind: PressPromiseKind;
  from: string;           // data da coletiva
  fixtureId?: string;     // win/win_bold numa coletiva pré-jogo: o jogo prometido
  season?: string;        // objective: SeasonObjective.season
}

export interface PressRecord {
  id: string;
  date: string;
  trigger: PressTrigger;
  /** `"director"`: the director spoke in the manager's place (10.8): no effect at all. */
  answers: { questionId: string; tone: PressTone }[] | "ignored" | "director";
}

export interface PressState {
  pending?: PressConference;
  lastDate?: string;
  winless: number;        // jogos oficiais seguidos sem vencer
  promises: PressPromise[];
  history: PressRecord[]; // últimas PRESS.HISTORY
}

/** O que o cliente recebe: sem `tone`. */
export interface PressRecordView { id: string; date: string; trigger: PressTrigger; answered: boolean }
export interface PressQuestionView extends Omit<PressQuestion, "answers"> { answers: { id: string; key: string }[] }
export interface PressConferenceView extends Omit<PressConference, "questions"> { questions: PressQuestionView[] }

import { PRESS } from "@/Domain/press/pressConfig";
import { mulberry32, seedFrom, shuffle } from "@/Domain/rng";
import type {
  PressConference, PressConferenceView, PressKind, PressParams, PressQuestion, PressTone, PressTopic, PressTrigger,
} from "@/types/pressTypes";

export type PlayerAngle = "star" | "scorer" | "culprit";

export interface ConferenceInput {
  id: string;
  trigger: PressTrigger;
  kind: PressKind;
  date: string;
  expires: string;
  fixtureId?: string;
  params: PressParams;
  player?: { id: string; name: string; angle: PlayerAngle };
  seed: string;
}

function tonesOf(topic: PressTopic, trigger: PressTrigger): PressTone[] {
  switch (topic) {
    case "match":
      return ["confident", "cautious", PRESS.BAD.includes(trigger) ? "blame_self" : "provocative"];
    case "squad":
      return ["defend_squad", "demand_squad", "neutral"];
    case "player":
      return ["praise", "criticize", "protect"];
    case "job":
      return ["job_confident", "ask_signings", "deflect"];
  }
}

function questionKey(topic: PressTopic, trigger: PressTrigger, angle: PlayerAngle | undefined, v: number): string {
  if (topic === "match") return `press.q.match.${trigger}.${v}`;
  if (topic === "player") return `press.q.player.${angle}.${v}`;
  if (topic === "squad") return `press.q.squad.${PRESS.BAD.includes(trigger) ? "bad" : "good"}.${v}`;
  return `press.q.job.${v}`;
}

export function buildConference(input: ConferenceInput): PressConference {
  const rng = mulberry32(seedFrom(input.seed));
  // Answer order: its own stream, so the variant picks stay what they were. Ids follow the shown order.
  const orderRng = mulberry32(seedFrom(`${input.seed}:order`));
  const pick = () => Math.floor(rng() * PRESS.VARIANTS);
  const topics: PressTopic[] = ["match"];
  if (input.player) topics.push("player");
  topics.push(input.trigger === "ultimatum" || input.trigger === "winless" ? "job" : "squad");

  const questions: PressQuestion[] = topics.map((topic, qi) => {
    const qid = `${input.id}-q${qi}`;
    const params: PressParams = topic === "player" && input.player ? { ...input.params, player: input.player.name } : input.params;
    return {
      id: qid,
      topic,
      key: questionKey(topic, input.trigger, input.player?.angle, pick()),
      params,
      ...(topic === "player" && input.player ? { playerId: input.player.id } : {}),
      answers: shuffle(tonesOf(topic, input.trigger).map((tone) => ({ key: `press.a.${tone}.${pick()}`, tone })), orderRng)
        .map((a, ai) => ({ id: `${qid}-a${ai}`, ...a })),
    };
  });

  return {
    id: input.id, trigger: input.trigger, kind: input.kind, date: input.date, expires: input.expires,
    ...(input.fixtureId ? { fixtureId: input.fixtureId } : {}),
    params: input.params, questions,
  };
}

export function conferenceView(c: PressConference): PressConferenceView {
  return { ...c, questions: c.questions.map((q) => ({ ...q, answers: q.answers.map(({ id, key }) => ({ id, key })) })) };
}

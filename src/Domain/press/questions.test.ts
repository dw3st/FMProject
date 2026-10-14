import { describe, expect, test } from "bun:test";
import { buildConference, conferenceView } from "@/Domain/press/questions";

const sorted = (xs: string[]) => [...xs].sort();
const tones = (q: { answers: { tone: string }[] }) => sorted(q.answers.map((a) => a.tone));

const base = {
  id: "press-2027-03-10", date: "2027-03-10", expires: "2027-03-12", fixtureId: "f1",
  params: { opponent: "Rival FC", opponentId: "r", competition: "premier_league" }, seed: "save:press-2027-03-10",
};

describe("buildConference", () => {
  test("clássico pré-jogo: pergunta do jogo com provocação, e do elenco", () => {
    const c = buildConference({ ...base, trigger: "derby", kind: "pre" });
    expect(c.questions.map((q) => q.topic)).toEqual(["match", "squad"]);
    expect(tones(c.questions[0]!)).toEqual(sorted(["confident", "cautious", "provocative"]));
  });
  test("derrota: assumir a culpa; com destaque, pergunta do jogador", () => {
    const c = buildConference({ ...base, trigger: "heavy_defeat", kind: "post", player: { id: "p9", name: "Zé", angle: "culprit" } });
    expect(c.questions.map((q) => q.topic)).toEqual(["match", "player", "squad"]);
    expect(tones(c.questions[0]!)).toEqual(sorted(["confident", "cautious", "blame_self"]));
    expect(c.questions[1]!.playerId).toBe("p9");
    expect(tones(c.questions[1]!)).toEqual(sorted(["praise", "criticize", "protect"]));
  });
  test("ultimato: pergunta do cargo no lugar da do elenco", () => {
    const c = buildConference({ ...base, trigger: "ultimatum", kind: "pre" });
    expect(c.questions.map((q) => q.topic)).toEqual(["match", "job"]);
    expect(tones(c.questions[1]!)).toEqual(sorted(["job_confident", "ask_signings", "deflect"]));
  });
  test("determinístico pela semente e chaves com variante", () => {
    const a = buildConference({ ...base, trigger: "derby", kind: "pre" });
    const b = buildConference({ ...base, trigger: "derby", kind: "pre" });
    expect(a).toEqual(b);
    expect(a.questions[0]!.key).toMatch(/^press\.q\.match\.derby\.[01]$/);
    for (const x of a.questions[0]!.answers) expect(["0", "1"].map((v) => `press.a.${x.tone}.${v}`)).toContain(x.key);
    expect(new Set(a.questions.flatMap((q) => q.answers.map((x) => x.id))).size).toBe(a.questions.length * 3);
  });
  test("a ordem das respostas é embaralhada pela semente (o tom não sai sempre na mesma posição)", () => {
    const orders = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const c = buildConference({ ...base, trigger: "derby", kind: "pre", seed: `s${i}` });
      orders.add(c.questions[0]!.answers.map((a) => a.tone).join(","));
      // Ids are positional: a0, a1, a2 in display order.
      expect(c.questions[0]!.answers.map((a) => a.id)).toEqual([0, 1, 2].map((i2) => `${c.questions[0]!.id}-a${i2}`));
    }
    expect(orders.size).toBeGreaterThan(3);
  });
  test("a visão do cliente não tem tom", () => {
    const v = conferenceView(buildConference({ ...base, trigger: "derby", kind: "pre" }));
    expect(JSON.stringify(v)).not.toContain("tone");
  });
});

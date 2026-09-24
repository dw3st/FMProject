import { describe, expect, test } from "bun:test";
import { clubLineRating, clubProfileStem, reputationStars } from "@/backend/clubProfile";
import type { RosterPlayer } from "@/types/playerTypes";

const standings = [
  { squadId: "33", slug: "manchester_united" },
  { squadId: "of_ae_al_ain", slug: "al_ain" },
];

describe("clubProfileStem", () => {
  test("resolves by squadId", () => {
    expect(clubProfileStem(standings, "33")).toBe("33");
  });
  test("resolves by slug", () => {
    expect(clubProfileStem(standings, "manchester_united")).toBe("33");
  });
  test("of_* squadId resolves to itself", () => {
    expect(clubProfileStem(standings, "of_ae_al_ain")).toBe("of_ae_al_ain");
  });
  test("unknown club returns null", () => {
    expect(clubProfileStem(standings, "nope")).toBeNull();
  });
});

describe("reputationStars", () => {
  test("popularidade vira 1–5 estrelas pelos cortes 42/52/65/80", () => {
    expect(reputationStars(100)).toBe(5);
    expect(reputationStars(80)).toBe(5);
    expect(reputationStars(79.9)).toBe(4);
    expect(reputationStars(65)).toBe(4);
    expect(reputationStars(52)).toBe(3);
    expect(reputationStars(42)).toBe(2);
    expect(reputationStars(41.9)).toBe(1);
    expect(reputationStars(0)).toBe(1);
  });
});

describe("clubLineRating", () => {
  const p = (pos: string, v: number) => ({ positions: [pos], overallAvg: v }) as unknown as RosterPlayer;

  test("usa só os titulares da linha (melhores N) × 10", () => {
    // 4 defensores titulares 6,6,6,6 + reservas fracos não puxam a nota para baixo
    const players = [p("CB", 6), p("CB", 6), p("LB", 6), p("RB", 6), p("CB", 2), p("Defender", 1)];
    expect(clubLineRating(players, "Defender")).toBe(60);
  });

  test("linha com menos jogadores que vagas usa quem existe; linha vazia é 0", () => {
    expect(clubLineRating([p("ST", 5)], "Forward")).toBe(50);
    expect(clubLineRating([p("ST", 5)], "Midfielder")).toBe(0);
  });
});

import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { advanceOneDay } from "@/backend/advanceDay";

/** World news written by the day pipeline (`.claude/rules/game/press.md` → "Notícias", Etapa 42). */
describe("news in advanceOneDay", () => {
  const created: string[] = [];
  afterAll(async () => { for (const id of created) await saveService.deleteSave(id); });

  test("dias com jogos geram notícias, nenhum dia acima dos tetos, ids únicos", async () => {
    const meta = await saveService.createSave({ leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"] });
    created.push(meta.id);
    for (let i = 0; i < 10; i++) expect((await advanceOneDay(saveService, meta.id)).ok).toBe(true);
    const months = await saveService.listNewsMonths(meta.id);
    const all = (await Promise.all(months.map((m) => saveService.getNewsMonth(meta.id, m)))).flat();
    expect(all.length).toBeGreaterThan(0);
    expect(new Set(all.map((n) => n.id)).size).toBe(all.length);
    const perDay = new Map<string, number>();
    for (const n of all) perDay.set(n.date, (perDay.get(n.date) ?? 0) + 1);
    for (const c of perDay.values()) expect(c).toBeLessThanOrEqual(30);
  }, 600_000);
});

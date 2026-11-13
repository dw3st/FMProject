import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { advanceOneDay } from "@/backend/advanceDay";
import { addDays } from "@/Domain/dates";
import { describeLedgerEntry } from "@/Domain/finance/ledgerText";
import { SPONSORS } from "@/Domain/sponsors/sponsorConfig";
import type { Squad } from "@/types/playerTypes";
import type { SponsorBrand, SponsorContract } from "@/types/sponsorTypes";

/**
 * Sponsors at the rollover of the club's country (`.claude/rules/game/sponsors.md`): bonuses into the new season's
 * ledger, contracts a season shorter, renewals, new offers for the empty slots, the inbox after the `clearInbox`;
 * a club without the record (a save from before 12.0) gets it there, with no evaluation.
 */
describe("sponsors in advanceOneDay", () => {
  const created: string[] = [];
  afterAll(async () => {
    for (const id of created) await saveService.deleteSave(id);
  });

  const create = async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"], sackingEnabled: false,
    });
    created.push(meta.id);
    return meta;
  };

  /** The season ends today: the next advance rolls England over. */
  const endSeasonToday = async (saveId: string) => {
    const meta = (await saveService.getMeta(saveId))!;
    const active = (meta.activeLeagues ?? []).map((l) =>
      l.leagueSlug === "premier_league" || l.leagueSlug === "of_championship" ? { ...l, end: meta.currentDate! } : l);
    await saveService.updateMeta(saveId, { activeLeagues: active });
  };

  const ledgerOf = async (saveId: string, seatId: string) =>
    (await Promise.all((await saveService.listLedgerSeasons(saveId, seatId)).map((s) => saveService.getLedger(saveId, s, seatId)))).flat();

  const brand = (id: string): SponsorBrand => ({ id, name: `Brand ${id}`, sector: "bank", size: "national", colors: ["#101010", "#fefefe"] });
  const contract = (over: Partial<SponsorContract> & Pick<SponsorContract, "id" | "slot">): SponsorContract => ({
    company: brand(over.id), profile: "standard", annual: 2_000_000, bonus: 300_000,
    goal: { kind: "league_position", max: 20 }, seasonsLeft: 2, signedOn: "2026-08-15", ...over,
  });

  test("rollover: bonuses, a season less, renewals, new offers, inbox", async () => {
    const meta = await create();
    const today = meta.currentDate!;
    const squad = (await saveService.getSquadById(meta.id, "33"))!;
    const contracts: SponsorContract[] = [
      // Goal met (any position of 20), two seasons left: bonus, it goes on.
      contract({ id: "m", slot: "master", annual: 5_200_000, bonus: 1_000_000 }),
      // Goal met, last season: bonus and a renewal at × 1.10.
      contract({ id: "k", slot: "kit", seasonsLeft: 1 }),
      // Not a position goal, missed, last season: a renewal at × 0.90, no bonus.
      contract({ id: "b1", slot: "board", seasonsLeft: 1, goal: { kind: "promotion" }, annual: 600_000, bonus: 100_000 }),
      // Missed in the middle of the contract: no bonus, it goes on.
      contract({ id: "b2", slot: "board", goal: { kind: "followers_growth", pct: 5 }, annual: 600_000, bonus: 100_000 }),
    ];
    await saveService.saveSquadById(meta.id, { ...squad, sponsors: { contracts, offers: [] } });
    await endSeasonToday(meta.id);
    const oldYear = (await saveService.getLeagueMeta(meta.id, "premier_league"))!.year;

    expect((await advanceOneDay(saveService, meta.id)).ok).toBe(true);
    const newYear = (await saveService.getLeagueMeta(meta.id, "premier_league"))!.year;
    expect(newYear).toBe(oldYear + 1);

    const after = (await saveService.getSquadById(meta.id, "33"))!.sponsors!;
    // The forced one-game season may leave the club in the bottom three: then every company leaves at once.
    if ((await saveService.getSquadIndex(meta.id)).byId("33")!.leagueSlug !== "premier_league") {
      expect(after.contracts).toEqual([]);
      expect(after.offers.some((o) => o.renewal)).toBe(false);
      const down = (await saveService.getInbox(meta.id, meta.seatId)).find((m) => m.category === "sponsor" && m.kind === "season_review");
      if (down?.category === "sponsor") expect(down.left!.every((l) => l.reason === "relegated")).toBe(true);
      return;
    }
    expect(after.contracts.map((c) => [c.id, c.seasonsLeft])).toEqual([["m", 1], ["b2", 1]]);
    // The books (12.1): the goal and the bonus counted on the contracts that go on, the ended ones in the history.
    expect(after.contracts.map((c) => [c.id, c.paid?.met, c.paid?.missed, c.paid?.bonus])).toEqual([["m", 1, 0, 1_000_000], ["b2", 0, 1, 0]]);
    expect((after.history ?? []).map((h) => [h.companyId, h.slot, h.end, h.seasons, h.goalsMet, h.bonusPaid, h.from, h.to])).toEqual([
      ["k", "kit", "expired", 1, 1, 300_000, "2026-08-15", today], ["b1", "board", "expired", 1, 0, 0, "2026-08-15", today],
    ]);

    // Bonuses: one line each in the new season's ledger; the ledger still sums to the balance.
    const bonusLines = (await saveService.getLedger(meta.id, newYear, meta.seatId)).filter((e) => e.kind === "commercial" && e.ref?.stage === "sponsor_bonus");
    expect(bonusLines.map((e) => [e.amount, e.ref?.clubName]).sort()).toEqual([[1_000_000, "Brand m"], [300_000, "Brand k"]].sort());
    expect(describeLedgerEntry(bonusLines[0]!)).toEqual({ key: "sponsorBonus", club: bonusLines[0]!.ref!.clubName! });
    const balance = (await saveService.getSquadById(meta.id, "33"))!.finances!.budget;
    expect(Math.abs((await ledgerOf(meta.id, meta.seatId)).reduce((s, e) => s + e.amount, 0) - balance)).toBeLessThan(1);

    // Renewals of the two contracts that ended, and new offers for the empty places (kit 2, boards 3 free + 2).
    const renewals = after.offers.filter((o) => o.renewal);
    expect(renewals.map((o) => [o.company.id, o.slot, o.annual, o.bonus]).sort()).toEqual([
      ["b1", "board", 540_000, 90_000], ["k", "kit", 2_200_000, 330_000],
    ]);
    const fresh = after.offers.filter((o) => !o.renewal);
    expect(fresh.filter((o) => o.slot === "master")).toHaveLength(0);
    expect(fresh.filter((o) => o.slot === "kit")).toHaveLength(SPONSORS.SLOTS.kit.offers);
    expect(fresh.filter((o) => o.slot === "board")).toHaveLength(3 + SPONSORS.BOARD_EXTRA_OFFERS);
    for (const o of after.offers) expect(o.expires).toBe(addDays(today, SPONSORS.OFFER_DAYS));
    expect(new Set(after.offers.map((o) => o.id)).size).toBe(after.offers.length);

    // Inbox, after the rollover's clear: the review and the offers on the table.
    const inbox = await saveService.getInbox(meta.id, meta.seatId);
    const review = inbox.find((m) => m.category === "sponsor" && m.kind === "season_review");
    const offers = inbox.find((m) => m.category === "sponsor" && m.kind === "offers");
    expect(review).toBeDefined();
    expect(offers).toBeDefined();
    if (review?.category === "sponsor") {
      expect(review.bonuses).toHaveLength(2);
      expect(review.renewals!.map((r) => r.company).sort()).toEqual(["Brand b1", "Brand k"]);
      expect(review.left).toEqual([]);
    }
    if (offers?.category === "sponsor") {
      expect(offers.offers).toEqual([{ slot: "kit", count: 3 }, { slot: "board", count: 6 }]);
      expect(offers.expires).toBe(addDays(today, SPONSORS.OFFER_DAYS));
    }

    // No AI club got anything.
    expect((await saveService.getAllSquads(meta.id)).filter((s) => s.sponsors).map((s) => String(s.id))).toEqual(["33"]);
  }, 300_000);

  test("a club without the record gets it at the rollover: offers for every slot, no evaluation", async () => {
    const meta = await create();
    const { sponsors: _gone, ...legacy } = (await saveService.getSquadById(meta.id, "33"))!;
    await saveService.saveSquadById(meta.id, legacy as Squad);
    await endSeasonToday(meta.id);

    expect((await advanceOneDay(saveService, meta.id)).ok).toBe(true);
    const after = (await saveService.getSquadById(meta.id, "33"))!.sponsors!;
    expect(after.contracts).toEqual([]);
    expect(after.offers.filter((o) => o.slot === "master")).toHaveLength(3);
    expect(after.offers.filter((o) => o.slot === "kit")).toHaveLength(2);
    expect(after.offers.filter((o) => o.slot === "board")).toHaveLength(6);
    expect((await ledgerOf(meta.id, meta.seatId)).some((e) => e.ref?.stage === "sponsor_bonus")).toBe(false);
    const inbox = await saveService.getInbox(meta.id, meta.seatId);
    expect(inbox.some((m) => m.category === "sponsor" && m.kind === "offers")).toBe(true);
    expect(inbox.some((m) => m.category === "sponsor" && m.kind === "season_review")).toBe(false);
  }, 300_000);
});

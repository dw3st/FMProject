import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { clubOverview } from "@/backend/clubOverviewWorld";
import { apiRoutes } from "@/backend/routes";
import { bioLanguage, parseSponsorBios, sponsorBioOf, sponsorBios } from "@/backend/sponsorBios";
import { sponsorCatalog } from "@/backend/sponsorCatalog";
import { humanMasterSeasons } from "@/backend/sponsorCompanyWorld";
import { ownSolo, updateSolo } from "@/backend/testing/seatFixtures";
import { naturalFinancialTier } from "@/Domain/aiFinance/aiClubFinance";
import { emptyClubHistory } from "@/Domain/clubHistory/clubHistory";
import { aiMasterSponsorOf } from "@/Domain/sponsors/sponsors";
import { sponsorTraitOf } from "@/Domain/sponsors/sponsorTraits";
import type { ClubSeasonRow } from "@/types/clubHistoryTypes";
import type { ClubSponsors, SponsorCompanyView, SponsorHistoryEntry, SponsorsView } from "@/types/sponsorTypes";

const PAGE = "/api/saves/:saveId/sponsors/company/:companyId";
const OFFER = "/api/saves/:saveId/sponsors/offers/:offerId";

type Handler = (req: Request & { params: Record<string, string> }) => Response | Promise<Response>;

/** A route called directly, with a query string (the shared `callApi` has none). */
async function call(method: "GET" | "POST", pattern: string, token: string, params: Record<string, string>, opts: { query?: string; body?: unknown } = {}) {
  let path = pattern;
  for (const [k, v] of Object.entries(params)) path = path.replace(`:${k}`, encodeURIComponent(v));
  const headers: Record<string, string> = { cookie: `fs_session=${token}` };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const req = Object.assign(
    new Request(`http://localhost:3000${path}${opts.query ?? ""}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) }),
    { params },
  );
  const res = await ((apiRoutes as Record<string, unknown>)[pattern] as Handler)(req);
  const text = await res.text();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let json: any = null;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, json };
}

const row = (over: Partial<ClubSeasonRow> & Pick<ClubSeasonRow, "season">): ClubSeasonRow => ({
  league: "premier_league", tier: 1, position: 5, played: 38, won: 20, drawn: 8, lost: 10, gf: 60, ga: 40, points: 68, titles: [], ...over,
});

describe("sponsor bios", () => {
  test("parsing: only entries with some text; language by the query, never the other language", () => {
    const bios = parseSponsorBios({ a: { pt: " Olá ", en: "Hello" }, b: { pt: "Só" }, c: { pt: "", en: "  " }, d: "x", e: null });
    expect(bios).toEqual({ a: { pt: "Olá", en: "Hello" }, b: { pt: "Só" } });
    expect(parseSponsorBios([1, 2])).toEqual({});
    expect(parseSponsorBios(null)).toEqual({});
    expect(bioLanguage("pt-BR")).toBe("pt");
    expect(bioLanguage("pt")).toBe("pt");
    for (const lang of ["en", "es", "", null, undefined]) expect(bioLanguage(lang)).toBe("en");
    expect(sponsorBioOf("a", "pt-BR", bios)).toBe("Olá");
    expect(sponsorBioOf("a", "en", bios)).toBe("Hello");
    expect(sponsorBioOf("a", "fr", bios)).toBe("Hello");
    expect(sponsorBioOf("b", "en", bios)).toBeNull();
    expect(sponsorBioOf("zz", "pt-BR", bios)).toBeNull();
    expect(sponsorBioOf("a", "pt-BR", {})).toBeNull();
  });
});

describe("a human club's seasons under each master sponsor", () => {
  test("a finished contract takes the seasons that closed with it; the running one the reviews counted on it", () => {
    const rows = [row({ season: "2026-27" }), row({ season: "2027-28" }), row({ season: "2028-29" }), row({ season: "2029-30" })];
    const entry = (over: Partial<SponsorHistoryEntry>): SponsorHistoryEntry => ({
      companyId: "old", companyName: "Old", slot: "master", from: "2026-08-15", to: "2028-05-20", seasons: 2,
      fixedPaid: 0, bonusPaid: 0, goalsMet: 1, goalsMissed: 1, end: "expired", ...over,
    });
    const sponsors: ClubSponsors = {
      contracts: [{
        id: "c", slot: "master", company: { id: "now", name: "Now", sector: "bank", size: "global", colors: ["#000000", "#ffffff"] },
        profile: "standard", annual: 1, bonus: 0, goal: { kind: "promotion" }, seasonsLeft: 1, signedOn: "2028-06-01", paid: { fixed: 0, bonus: 0, met: 1, missed: 1 },
      }],
      offers: [],
      history: [entry({}), entry({ companyId: "boards", slot: "board" }), entry({ companyId: "zero", seasons: 0 })],
    };
    expect(humanMasterSeasons(sponsors, rows).map((s) => [s.companyId, s.row.season])).toEqual([
      ["old", "2026-27"], ["old", "2027-28"], ["now", "2028-29"], ["now", "2029-30"],
    ]);
    // Calendar-year seasons close in their own year.
    const civil = [row({ season: "2027" }), row({ season: "2028" })];
    expect(humanMasterSeasons({ contracts: [], offers: [], history: [entry({ to: "2027-12-10", seasons: 1 })] }, civil).map((s) => s.row.season)).toEqual(["2027"]);
    // A contract from before the books (no totals) counts nothing yet.
    expect(humanMasterSeasons({ contracts: [{ ...sponsors.contracts[0]!, paid: undefined }], offers: [] }, rows)).toEqual([]);
  });
});

describe("sponsor page route", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("404s, current clubs agree with the club page, bio, results, history and the seat's own dealings", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("sponsor-page@test.local");
    const other = devAutoLogin("sponsor-page-other@test.local");
    await ownSolo(saveId, user.id);
    const page = (companyId: string, query = "", token = session.token) => call("GET", PAGE, token, { saveId, companyId }, { query });
    const catalog = sponsorCatalog();
    const seat = (await saveService.getSeatMeta(saveId, meta.seatId))!;
    const squads = await saveService.getAllSquads(saveId);
    const index = await saveService.getSquadIndex(saveId);

    // A title of an AI club in a finished season, before the first read (the page's scan is cached per day and data).
    const champion = squads.find((s) => String(s.id) !== "33" && index.byId(String(s.id))?.leagueSlug === "premier_league")!;
    const championId = String(champion.id);
    await saveService.writeClubHistory(saveId, {
      ...emptyClubHistory(championId),
      seasons: [
        row({ season: "2024-25", position: 1, titles: ["league:premier_league", "promotion:of_championship"] }),
        row({ season: "2025-26", position: 18, move: "relegated" }),
      ],
    });
    const masterThen = (season: number) => aiMasterSponsorOf(catalog, { clubId: championId, season, country: "England", tier: naturalFinancialTier(champion.finances) })!;

    // Unknown company; not a member (indistinguishable from a missing save).
    expect((await page("sp_does_not_exist")).status).toBe(404);
    expect((await page(catalog[0]!.id, "", other.session.token)).status).toBe(404);

    // Timing of the world scan: the first read builds it, the second reuses it.
    const t0 = performance.now();
    const first = await page(masterThen(2024).id, "?lang=pt-BR");
    const cold = performance.now() - t0;
    const t1 = performance.now();
    await page(masterThen(2024).id, "?lang=pt-BR");
    const cached = performance.now() - t1;
    console.log(`sponsor page: cold ${cold.toFixed(0)} ms, cached ${cached.toFixed(1)} ms (${squads.length} clubs)`);
    expect(first.status).toBe(200);

    // The company block: the catalog's company, its derived trait, the bio in the asked language (null without one).
    const view = first.json as SponsorCompanyView;
    const company = catalog.find((c) => c.id === masterThen(2024).id)!;
    expect(view.company).toEqual({
      id: company.id, name: company.name, sector: company.sector, size: company.size, country: company.country ?? null,
      colors: company.colors, trait: sponsorTraitOf(company.id), bio: sponsorBioOf(company.id, "pt-BR"),
    });
    const english = (await page(company.id, "?lang=en")).json as SponsorCompanyView;
    expect(english.company.bio).toBe(sponsorBioOf(company.id, "en"));
    expect(((await page(company.id)).json as SponsorCompanyView).company.bio).toBe(english.company.bio);
    const withBio = catalog.find((c) => sponsorBios()[c.id]?.pt && sponsorBios()[c.id]?.en);
    if (withBio) {
      const pt = ((await page(withBio.id, "?lang=pt-BR")).json as SponsorCompanyView).company.bio;
      const en = ((await page(withBio.id, "?lang=en")).json as SponsorCompanyView).company.bio;
      expect(pt).toBe(sponsorBios()[withBio.id]!.pt!);
      expect(en).toBe(sponsorBios()[withBio.id]!.en!);
    }

    // Results: the AI club's finished seasons under the master sponsor it had then (titles without the promotion).
    const title = view.results.rows.find((r) => r.squadId === championId && r.season === "2024-25")!;
    expect(title).toMatchObject({ league: "premier_league", position: 1, titles: ["league:premier_league"], move: null, human: false, name: champion.name });
    expect(view.results.rows[0]!.titles.length).toBeGreaterThan(0);
    expect(view.results.titles).toBeGreaterThanOrEqual(1);
    expect(view.results.seasons).toBeGreaterThanOrEqual(1);
    const down = (await page(masterThen(2025).id)).json as SponsorCompanyView;
    expect(down.results.relegations).toBeGreaterThanOrEqual(1);
    expect(view.results.rows.length).toBeLessThanOrEqual(10);

    // Current clubs agree with the club page's master sponsor, for a sample of AI clubs of several leagues.
    const sample = squads.filter((s) => String(s.id) !== "33").filter((_, i) => i % 97 === 0).slice(0, 14);
    expect(sample.length).toBeGreaterThan(8);
    for (const squad of sample) {
      const master = (await clubOverview(saveService, saveId, seat, squad)).masterSponsor;
      expect(master).not.toBeNull();
      const v = (await page(master!.id)).json as SponsorCompanyView;
      const ref = v.current.master.find((c) => c.squadId === String(squad.id));
      expect(ref).toEqual({ squadId: String(squad.id), name: squad.name, leagueSlug: index.byId(String(squad.id))!.leagueSlug, human: false });
      // And every club the page lists as master has that company on its own page.
      const listed = v.current.master.find((c) => c.squadId !== String(squad.id));
      if (listed) {
        const theirs = (await saveService.getSquadById(saveId, listed.squadId))!;
        expect((await clubOverview(saveService, saveId, seat, theirs)).masterSponsor?.id).toBe(master!.id);
      }
      // The master clubs come with their place in the table.
      expect(v.results.now.map((n) => n.squadId).sort()).toEqual(v.current.master.map((c) => c.squadId).sort());
    }

    // The seat's own dealings: an open offer, then the contract, then its history.
    const mine0 = (await saveService.getSquadById(saveId, "33"))!.sponsors!;
    const offer = mine0.offers.find((o) => o.slot === "master")!;
    const before = (await page(offer.company.id)).json as SponsorCompanyView;
    expect(before.mine).not.toBeNull();
    expect(before.mine!.active).toBe(true);
    expect(before.mine!.contract).toBeNull();
    expect(before.mine!.offers.map((o) => o.id)).toEqual([offer.id]);
    expect(before.mine!.offers[0]!.progress).toBeDefined();
    expect(before.current.master.some((c) => c.squadId === "33")).toBe(false);

    const signed = await call("POST", OFFER, session.token, { saveId, offerId: offer.id }, { body: { action: "accept" } });
    expect(signed.status).toBe(200);
    const contractId = (signed.json.view as SponsorsView).contracts[0]!.id;
    const after = (await page(offer.company.id)).json as SponsorCompanyView;
    expect(after.mine!.contract).toMatchObject({ id: contractId, slot: "master", annual: offer.annual });
    expect(after.mine!.contract!.progress).toBeDefined();
    expect(after.mine!.offers).toEqual([]);
    expect(after.current.master.find((c) => c.squadId === "33")).toEqual({ squadId: "33", name: (await saveService.getSquadById(saveId, "33"))!.name, leagueSlug: "premier_league", human: true });

    // A finished contract of the human club: everyone sees the deal without the money, the seat sees its own numbers.
    const entry: SponsorHistoryEntry = {
      companyId: offer.company.id, companyName: offer.company.name, slot: "board", from: "2024-08-01", to: "2026-05-20", seasons: 2,
      fixedPaid: 1_200_000, bonusPaid: 90_000, goalsMet: 1, goalsMissed: 1, end: "left_early",
    };
    const sq = (await saveService.getSquadById(saveId, "33"))!;
    await saveService.saveSquadById(saveId, { ...sq, sponsors: { ...sq.sponsors!, history: [entry] } });
    const withHistory = (await page(offer.company.id)).json as SponsorCompanyView;
    expect(withHistory.history).toEqual([{
      companyId: offer.company.id, slot: "board", from: "2024-08-01", to: "2026-05-20", seasons: 2, end: "left_early",
      squadId: "33", name: sq.name, leagueSlug: "premier_league", human: true,
    }]);
    expect(JSON.stringify(withHistory.history)).not.toContain("fixedPaid");
    expect(withHistory.mine!.history).toEqual([entry]);

    // Without a club the page still opens, with nothing of the seat's own.
    await updateSolo(saveId, { unemployed: { since: seat.currentDate! } as never });
    const jobless = await page(offer.company.id);
    expect(jobless.status).toBe(200);
    expect((jobless.json as SponsorCompanyView).mine).toBeNull();
  }, 300_000);
});

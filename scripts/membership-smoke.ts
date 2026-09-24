/**
 * Membership smoke test: proves a club can change league inside a save.
 *
 * The save's `squads/{league}/` folders are the source of truth for league membership
 * (plan 3a). This script:
 *   1. creates a Premier League career the way the new-game wizard does
 *      (createSave + applyBroadcasting + applyRandomStartKit — same as bench-advance-day);
 *   2. moves one Championship club (`of_championship`) into `premier_league`;
 *   3. moves one Premier League club (not the player's) into `of_championship`;
 *   4. checks file counts, duplicate ids, index membership, slug lookups and the
 *      `/api/saves/:id/squad/:league/:club` route (auth mocked);
 *   5. advances 3 days with a BufferingSaveDAL per day, flushed on success —
 *      exactly what POST /api/advance-day/:saveId does — and checks both moved
 *      clubs' squad files were written in their new leagues.
 * The save is always deleted at the end. Exits 1 on any failed check.
 *
 * Known limitation: the current season's calendar still has the old league's ids.
 * The moved clubs keep playing their old fixtures because matches load squads by id,
 * which is exactly the robustness this proves. A new calendar is plan 3b's job.
 *
 * Run:  bun scripts/membership-smoke.ts
 */
import { mock } from "bun:test";
import { fileURLToPath } from "node:url";

// Windows-safe default for the runtime dir; must be set before backend modules load.
process.env.RUNTIME_DATA_DIR ||= fileURLToPath(new URL("../src/Data", import.meta.url));

// Route check without a login: every request counts as the save owner.
mock.module("@/backend/auth/middleware", () => ({
  getAuth: () => ({ userId: "smoke", email: "smoke@local" }),
  requireAuth: () => ({ userId: "smoke", email: "smoke@local" }),
  requireSaveOwner: () => ({ userId: "smoke", email: "smoke@local" }),
}));

const { SaveService, saveService } = await import("@/backend/SaveService");
const { FileSystemDAL } = await import("@/backend/dal/FileSystemDAL");
const { BufferingSaveDAL } = await import("@/backend/dal/BufferingSaveDAL");
const { advanceOneDay } = await import("@/backend/advanceDay");
const { applyRandomStartKit } = await import("@/backend/startKits");
const { applyBroadcasting } = await import("@/backend/FinancialService");
const { apiRoutes } = await import("@/backend/routes");

const EXPECTED_SQUAD_FILES = 1227;
const DAYS = 3;
const PL = "premier_league";
const CHAMP = "of_championship";

type LeagueEntry = { slug: string; name: string; standings: Array<{ squadId: string; name?: string; colors?: [string, string] }> };
const leagueData = (await Bun.file(fileURLToPath(new URL("../src/Data/leagueData.json", import.meta.url))).json()) as LeagueEntry[];
const databases = (await Bun.file(fileURLToPath(new URL("../src/Data/databases.json", import.meta.url))).json()) as Array<{
  id: string; name: string; version: string; startDate: string;
}>;

const failures: string[] = [];
function check(ok: boolean, label: string): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures.push(label);
}

async function createSmokeSave(): Promise<string> {
  const pl = leagueData.find((l) => l.slug === PL);
  const club = pl?.standings[0];
  if (!pl || !club) throw new Error("premier_league not found in leagueData");
  const db = databases[0]!;
  const meta = await saveService.createSave({
    leagueSlug: pl.slug,
    leagueName: pl.name,
    clubId: club.squadId,
    clubName: club.name ?? club.squadId,
    clubColors: club.colors ?? ["#888888", "#ffffff"],
    budget: 0,
    database: { id: db.id, name: db.name, version: db.version, startDate: db.startDate },
    manager: { name: "Smoke Manager", nationalityIso: "gb", backgroundId: "former-player" },
  });
  await applyBroadcasting(meta.id, meta, meta.leagueSlug, meta.clubId);
  const kit = await applyRandomStartKit(meta.id);
  console.log(`Save ${meta.id} — ${club.name} (${pl.name}), start ${meta.currentDate}, kit: ${kit.applied ? kit.kit : kit.reason}\n`);
  return meta.id;
}

async function checkFiles(saveId: string, when: string): Promise<void> {
  const files = await new SaveService(new FileSystemDAL()).listSquadFiles(saveId);
  const ids = files.map((f) => f.squad.id);
  check(files.length === EXPECTED_SQUAD_FILES, `${when}: ${files.length} squad files (expected ${EXPECTED_SQUAD_FILES})`);
  check(new Set(ids).size === ids.length, `${when}: no duplicate squad ids (${ids.length - new Set(ids).size} dupes)`);
}

type RouteHandler = (req: Request & { params: Record<string, string> }) => Promise<Response>;
async function squadRoute(saveId: string, league: string, club: string): Promise<{ status: number; id?: string; leagueSlug?: string }> {
  const handler = (apiRoutes as unknown as Record<string, RouteHandler>)["/api/saves/:saveId/squad/:league/:club"]!;
  const req = Object.assign(new Request(`http://local/api/saves/${saveId}/squad/${league}/${club}`), {
    params: { saveId, league, club },
  });
  const res = await handler(req);
  if (!res.ok) return { status: res.status };
  const body = (await res.json()) as { id: string; leagueSlug?: string };
  return { status: res.status, id: body.id, leagueSlug: body.leagueSlug };
}

let saveId: string | null = null;
try {
  saveId = await createSmokeSave();
  const meta = (await saveService.getMeta(saveId))!;
  await checkFiles(saveId, "fresh save");

  // ── Pick the clubs ────────────────────────────────────────────────────────
  const index0 = await saveService.getSquadIndex(saveId);
  const playerSquadId = index0.byId(meta.clubId)?.squadId
    ?? index0.inLeague(PL).find((t) => t.slug === meta.clubId)?.squadId
    ?? meta.clubId;
  const up = index0.inLeague(CHAMP)[0];
  // A native PL club (slug ≠ id) so the slug lookup in its new league is meaningful.
  const down = index0.inLeague(PL).find((t) => t.squadId !== playerSquadId && t.slug && t.slug !== t.squadId)
    ?? index0.inLeague(PL).find((t) => t.squadId !== playerSquadId);
  if (!up || !down) throw new Error(`could not pick clubs (up=${up?.squadId}, down=${down?.squadId})`);
  const downSlug = down.slug ?? down.squadId;
  const plBefore = index0.inLeague(PL).map((t) => t.squadId);
  const champBefore = index0.inLeague(CHAMP).map((t) => t.squadId);
  console.log(`\nPlayer club ${playerSquadId}. Up: ${up.name} (${up.squadId}) ${CHAMP} → ${PL}. ` +
    `Down: ${down.name} (${down.squadId}, slug ${downSlug}) ${PL} → ${CHAMP}\n`);

  // ── Move ──────────────────────────────────────────────────────────────────
  await saveService.moveSquad(saveId, up.squadId, PL);
  await saveService.moveSquad(saveId, down.squadId, CHAMP);

  await checkFiles(saveId, "after moves");
  const index1 = await new SaveService(new FileSystemDAL()).getSquadIndex(saveId);
  const plAfter = index1.inLeague(PL).map((t) => t.squadId);
  const champAfter = index1.inLeague(CHAMP).map((t) => t.squadId);
  const expectedPl = [...plBefore.filter((id) => id !== down.squadId), up.squadId].sort();
  const expectedChamp = [...champBefore.filter((id) => id !== up.squadId), down.squadId].sort();
  check(JSON.stringify([...plAfter].sort()) === JSON.stringify(expectedPl),
    `index.inLeague(${PL}): ${plAfter.length} clubs, ${up.squadId} in, ${down.squadId} out`);
  check(JSON.stringify([...champAfter].sort()) === JSON.stringify(expectedChamp),
    `index.inLeague(${CHAMP}): ${champAfter.length} clubs, ${down.squadId} in, ${up.squadId} out`);
  check(index1.byId(up.squadId)?.leagueSlug === PL && index1.byId(down.squadId)?.leagueSlug === CHAMP,
    "index.byId reports the new leagues");

  const downInNew = await saveService.getSquad(saveId, CHAMP, downSlug);
  const downInOld = await saveService.getSquad(saveId, PL, downSlug);
  check(downInNew?.id === down.squadId, `getSquad(${CHAMP}, "${downSlug}") finds the moved native club`);
  check(downInOld === null, `getSquad(${PL}, "${downSlug}") is null in the old league`);
  check((await saveService.getSquad(saveId, PL, up.squadId))?.id === up.squadId, `getSquad(${PL}, "${up.squadId}") finds the promoted club`);
  check((await saveService.getSquadById(saveId, down.squadId))?.leagueSlug === CHAMP, "getSquadById: file's leagueSlug is the new league");

  // Squad route (what the opponent fetch in MatchPreview/MatchResult uses).
  const r1 = await squadRoute(saveId, PL, down.squadId);
  check(r1.status === 200 && r1.id === down.squadId && r1.leagueSlug === CHAMP,
    `route /squad/${PL}/${down.squadId} → ${r1.status} ${r1.id ?? ""} in ${r1.leagueSlug ?? "?"} (id fallback)`);
  const r2 = await squadRoute(saveId, PL, up.squadId);
  check(r2.status === 200 && r2.id === up.squadId && r2.leagueSlug === PL,
    `route /squad/${PL}/${up.squadId} → ${r2.status} ${r2.id ?? ""} in ${r2.leagueSlug ?? "?"}`);
  const r3 = await squadRoute(saveId, CHAMP, downSlug);
  check(r3.status === 200 && r3.id === down.squadId, `route /squad/${CHAMP}/${downSlug} → ${r3.status} ${r3.id ?? ""} (slug in new league)`);

  // ── Advance days (buffered, like the live route) ──────────────────────────
  const plain = new SaveService(new FileSystemDAL());
  const readRaw = async (league: string, stem: string) =>
    JSON.stringify(await new FileSystemDAL().readSquad(saveId!, league, stem));
  const upStem = index1.byId(up.squadId)!.stem;
  const downStem = index1.byId(down.squadId)!.stem;
  const written = { up: false, down: false };
  for (let d = 0; d < DAYS; d++) {
    const date = (await plain.getMeta(saveId))?.currentDate ?? "?";
    const upBefore = await readRaw(PL, upStem);
    const downBefore = await readRaw(CHAMP, downStem);
    const buffer = new BufferingSaveDAL(new FileSystemDAL());
    const t0 = performance.now();
    const outcome = await advanceOneDay(new SaveService(buffer), saveId);
    if (outcome.ok) await buffer.flush();
    const ms = performance.now() - t0;
    check(outcome.ok, `advanceOneDay ${date} (${ms.toFixed(0)} ms)${outcome.ok ? "" : `: ${outcome.status} ${outcome.error}`}`);
    if (!outcome.ok) break;
    const upChanged = (await readRaw(PL, upStem)) !== upBefore;
    const downChanged = (await readRaw(CHAMP, downStem)) !== downBefore;
    written.up ||= upChanged;
    written.down ||= downChanged;
    console.log(`      ${up.squadId} written in ${PL}: ${upChanged} · ${down.squadId} written in ${CHAMP}: ${downChanged}`);
    await checkFiles(saveId, `after ${date}`);
  }
  check(written.up, `${up.name} squad file was written in ${PL} during the ${DAYS} days`);
  check(written.down, `${down.name} squad file was written in ${CHAMP} during the ${DAYS} days`);
  const idx = await plain.getSquadIndex(saveId);
  check(idx.byId(up.squadId)?.leagueSlug === PL && idx.byId(down.squadId)?.leagueSlug === CHAMP,
    "membership still correct after the days");
} catch (e) {
  failures.push(`exception: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
  console.error(e);
} finally {
  if (saveId) {
    await saveService.deleteSave(saveId);
    console.log(`\nDeleted save ${saveId}`);
  }
}

if (failures.length) {
  console.log(`\n${failures.length} check(s) FAILED:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("\nAll membership checks passed.");
process.exit(0);

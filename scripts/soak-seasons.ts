/**
 * Soak run: a new career advanced day by day for many seasons (the exact unit of work of the day advance,
 * `runBufferedDay`), looking for crashes and broken invariants that only show after years. The manager can't be
 * sacked; offers, press conferences and talks are left unanswered. Writes a log line per check and a yearly
 * summary (world rating spread, values, goals, save size, day time). Resumable: `--save <id>` continues a save.
 *
 *   bun scripts/soak-seasons.ts [--seasons 20] [--player-league premier_league] [--save <id>] [--keep]
 *
 * Without `--keep` the save is deleted at the end (also on failure).
 */
import { fileURLToPath } from "node:url";
import { readdir, stat } from "node:fs/promises";

process.env.RUNTIME_DATA_DIR ||= fileURLToPath(new URL("../src/Data", import.meta.url));

const args = process.argv.slice(2);
const arg = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const SEASONS = Number(arg("--seasons") ?? 20);
const LEAGUE = arg("--player-league") ?? "premier_league";
const KEEP = args.includes("--keep");

const { saveService, SaveService } = await import("@/backend/SaveService");
const { FileSystemDAL } = await import("@/backend/dal/FileSystemDAL");
const { runBufferedDay } = await import("@/backend/advanceDay");
const { applyRandomStartKit } = await import("@/backend/startKits");
const { applyBroadcasting } = await import("@/backend/FinancialService");
const { RUNTIME_DATA_DIR } = await import("@/backend/runtimeDir");
const { computeOverallAvg } = await import("@/Domain/playerRating");
const { playerMarketValue } = await import("@/Domain/negotiation/askingPrice");
const { addDays, daysBetween } = await import("@/Domain/dates");
type Squad = import("@/types/playerTypes").Squad;
type MatchEvent = import("@/types/dayLogTypes").MatchEvent;

interface LeagueEntry { slug: string; name: string; standings: { squadId: string; name?: string; colors?: [string, string] }[] }
const leagueData = (await Bun.file(`${RUNTIME_DATA_DIR}/leagueData.json`).json()) as LeagueEntry[];
const databases = (await Bun.file(`${RUNTIME_DATA_DIR}/databases.json`).json()) as { id: string; name: string; version: string; startDate: string }[];

const plain = () => new SaveService(new FileSystemDAL());
const problems: string[] = [];
const seen = new Set<string>();
/** A broken invariant: printed once per kind, every occurrence counted. */
const counts = new Map<string, number>();
function problem(kind: string, detail: string): void {
  counts.set(kind, (counts.get(kind) ?? 0) + 1);
  if (seen.has(kind)) return;
  seen.add(kind);
  const line = `PROBLEM ${kind}: ${detail}`;
  problems.push(line);
  console.log(line);
}
const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n);

async function createSave(): Promise<string> {
  const lg = leagueData.find((l) => l.slug === LEAGUE);
  const club = lg?.standings[0];
  if (!lg || !club) throw new Error(`${LEAGUE} not found`);
  const db = databases[0]!;
  const meta = await saveService.createSave({
    leagueSlug: lg.slug, leagueName: lg.name, clubId: club.squadId, clubName: club.name ?? club.squadId,
    clubColors: club.colors ?? ["#888888", "#ffffff"],
    database: { id: db.id, name: db.name, version: db.version, startDate: db.startDate },
    manager: { name: "Soak Manager", nationalityIso: "gb", backgroundId: "former-player" },
    sackingEnabled: false,
  });
  await applyBroadcasting(meta.id, meta, meta.leagueSlug, meta.clubId, meta.seatId);
  const kit = await applyRandomStartKit(meta.id);
  console.log(`save ${meta.id} — ${club.name} (${lg.name}), start ${meta.currentDate}, kit ${kit.applied ? kit.kit : kit.reason}`);
  return meta.id;
}

async function dirSize(p: string): Promise<number> {
  let total = 0;
  for (const e of await readdir(p, { withFileTypes: true })) {
    const f = `${p}/${e.name}`;
    total += e.isDirectory() ? await dirSize(f) : (await stat(f)).size;
  }
  return total;
}

/** The whole world: ids, sizes, numbers, contracts, injuries, suspensions. */
async function checkWorld(saveId: string, date: string, label: string): Promise<{ squads: Squad[] }> {
  const svc = plain();
  const files = await svc.listSquadFiles(saveId);
  const squads = files.map((f) => f.squad as Squad);
  const ids = new Map<string, string>();
  const squadIds = new Set<string>();
  for (const s of squads) {
    if (squadIds.has(s.id)) problem("duplicate squad", `${s.id} at ${label}`);
    squadIds.add(s.id);
    const n = s.players.length;
    if (n < 15 || n > 36) problem("squad size", `${s.name} has ${n} players at ${label}`);
    if (!finite(s.finances?.budget)) problem("budget not a number", `${s.name} ${s.finances?.budget} at ${label}`);
    if (s.aiTransferBudget !== undefined && (!finite(s.aiTransferBudget) || s.aiTransferBudget < 0)) problem("ai transfer budget", `${s.name} ${s.aiTransferBudget} at ${label}`);
    for (const p of [...s.players, ...(s.youth ?? [])]) {
      if (ids.has(p.id)) problem("duplicate player", `${p.id} (${p.name}) in ${ids.get(p.id)} and ${s.name} at ${label}`);
      ids.set(p.id, s.name);
      for (const [k, v] of Object.entries(p.stats ?? {})) {
        if (!finite(v) || (v as number) < 0 || (v as number) > 10) { problem("attribute out of range", `${p.name} ${k}=${v} at ${label}`); break; }
      }
      if (!finite(p.age) || p.age < 14 || p.age > 45) problem("age", `${p.name} age ${p.age} at ${label}`);
      const fit = p.seasonLog?.fitness;
      if (fit !== undefined && (!finite(fit) || fit < 0 || fit > 100)) problem("fitness", `${p.name} ${fit} at ${label}`);
      if (p.seasonLog?.load !== undefined && (!finite(p.seasonLog.load) || p.seasonLog.load < 0)) problem("load", `${p.name} ${p.seasonLog.load} at ${label}`);
      if (p.injury && p.injury.returnDate < date && daysBetween(p.injury.returnDate, date) > 1) problem("stale injury", `${p.name} return ${p.injury.returnDate} on ${date}`);
      if (p.suspension && (!finite(p.suspension.matches) || p.suspension.matches < 0)) problem("suspension", `${p.name} ${JSON.stringify(p.suspension)}`);
      if (s.players.includes(p) && !p.contract) problem("no contract", `${p.name} (${s.name}) at ${label}`);
      if (p.contract && (!finite(p.contract.wage) || p.contract.wage < 0)) problem("contract wage", `${p.name} ${p.contract.wage}`);
      if (p.morale !== undefined && (!finite(p.morale) || p.morale < 0 || p.morale > 100)) problem("morale", `${p.name} ${p.morale}`);
    }
  }
  const free = await svc.getFreeAgents(saveId);
  for (const f of free) {
    if (ids.has(f.player.id)) problem("free agent also in a squad", `${f.player.name} in ${ids.get(f.player.id)}`);
  }
  if (free.length > squads.length * 0.25) problem("free agent pool too big", `${free.length} for ${squads.length} clubs at ${label}`);
  const retired = await svc.getRetired(saveId);
  for (const r of retired.slice(-500)) if (ids.has(r.id)) { problem("retired player still playing", `${r.name} in ${ids.get(r.id)}`); break; }
  return { squads };
}

/** The seat: ledger sum = budget, board meters in range, the club exists. */
async function checkSeat(saveId: string, label: string): Promise<void> {
  const svc = plain();
  for (const seat of await svc.listSeats(saveId)) {
    const sm = await svc.getSeatMeta(saveId, seat.seatId);
    if (!sm) { problem("seat meta missing", label); continue; }
    if (!sm.clubId) continue;
    const squad = await svc.getSquadById(saveId, sm.clubId);
    if (!squad) { problem("seat club missing", `${sm.clubId} at ${label}`); continue; }
    let sum = 0;
    for (const season of await svc.listLedgerSeasons(saveId, seat.seatId)) {
      for (const e of await svc.getLedger(saveId, season, seat.seatId)) {
        if (!finite(e.amount)) problem("ledger entry not a number", `${e.kind} ${e.date}`);
        sum += e.amount;
      }
    }
    const bud = squad.finances?.budget ?? 0;
    if (Math.abs(sum - bud) > 2) problem("ledger sum != budget", `sum ${Math.round(sum)} budget ${Math.round(bud)} at ${label}`);
    const b = sm.board;
    if (b && (!(b.board >= 0 && b.board <= 100) || !(b.fans >= 0 && b.fans <= 100))) problem("board meters", `${JSON.stringify({ board: b.board, fans: b.fans })} at ${label}`);
    if (sm.tacticLog && sm.tacticLog.length > 5) problem("tactic log over 5", `${sm.tacticLog.length}`);
  }
}

interface Year { matches: number; goals: number; shots: number; dayMs: number; days: number; transfers: number; maxDayMs: number }
const newYear = (): Year => ({ matches: 0, goals: 0, shots: 0, dayMs: 0, days: 0, transfers: 0, maxDayMs: 0 });

async function summary(saveId: string, year: string, y: Year, squads: Squad[]): Promise<void> {
  const ovr = squads.flatMap((s) => s.players.map((p) => computeOverallAvg(p) * 10)).sort((a, b) => b - a);
  const vals = squads.flatMap((s) => s.players.map((p) => playerMarketValue(p))).sort((a, b) => b - a);
  const youth = squads.reduce((a, s) => a + s.players.filter((p) => p.age <= 21).length, 0);
  const players = ovr.length;
  const meanAge = squads.reduce((a, s) => a + s.players.reduce((b, p) => b + p.age, 0), 0) / players;
  const free = (await plain().getFreeAgents(saveId)).length;
  const retired = (await plain().getRetired(saveId)).length;
  const mb = (await dirSize(`${RUNTIME_DATA_DIR}/saves/${saveId}`)) / 1e6;
  console.log(
    `YEAR ${year}: players ${players} (<=21 ${youth}, mean age ${meanAge.toFixed(1)}), free ${free}, retired ${retired} | `
    + `OVR top ${ovr[0]?.toFixed(1)} 10th ${ovr[9]?.toFixed(1)} 100th ${ovr[99]?.toFixed(1)} 1000th ${ovr[999]?.toFixed(1)} median ${ovr[Math.floor(players / 2)]?.toFixed(1)}; `
    + `60+ ${ovr.filter((v) => v >= 60).length} 70+ ${ovr.filter((v) => v >= 70).length} | value top ${(vals[0]! / 1e6).toFixed(0)}M 100th ${(vals[99]! / 1e6).toFixed(0)}M | `
    + `goals/match ${(y.goals / Math.max(1, y.matches)).toFixed(2)} shots ${(y.shots / Math.max(1, y.matches)).toFixed(2)} (${y.matches} matches), transfers ${y.transfers} | `
    + `day ${(y.dayMs / Math.max(1, y.days) / 1000).toFixed(2)}s (max ${(y.maxDayMs / 1000).toFixed(1)}s) | save ${mb.toFixed(0)} MB`,
  );
}

const saveId = arg("--save") ?? (await createSave());
const start = (await plain().getMeta(saveId))!.currentDate as string;
const startYear = Number(start.slice(0, 4));
const endDate = `${startYear + SEASONS}-${start.slice(5)}`;
console.log(`running ${start} → ${endDate} (${daysBetween(start, endDate)} days)`);
await checkWorld(saveId, start, "start");

let y = newYear();
let lastMonth = start.slice(0, 7);
let lastYear = start.slice(0, 4);
let failedDays = 0;
const t0 = Date.now();
try {
  for (;;) {
    const meta = await plain().getMeta(saveId);
    const date = meta!.currentDate as string;
    if (date >= endDate) break;
    const t = Date.now();
    let out;
    try {
      out = await runBufferedDay(saveId);
    } catch (e) {
      problem("day threw", `${date}: ${(e as Error).stack?.split("\n").slice(0, 4).join(" | ")}`);
      failedDays++;
      if (failedDays >= 3) throw new Error(`three failed days, stopping at ${date}`);
      continue;
    }
    const ms = Date.now() - t;
    if (!out.ok) {
      problem("day failed", `${date}: ${out.status} ${out.error}`);
      failedDays++;
      if (failedDays >= 3) throw new Error(`three failed days, stopping at ${date}`);
      continue;
    }
    failedDays = 0;
    const after = (await plain().getMeta(saveId))!.currentDate as string;
    if (after !== addDays(date, 1)) problem("date did not move one day", `${date} → ${after}`);
    y.days++; y.dayMs += ms; y.maxDayMs = Math.max(y.maxDayMs, ms);
    if (ms > 60_000) problem("slow day", `${date}: ${(ms / 1000).toFixed(0)} s`);

    const log = await plain().getDayLog(saveId, date);
    for (const e of log?.events ?? []) {
      if (e.kind !== "match") continue;
      const m = e as MatchEvent;
      const { home, away } = m.score;
      if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0 || home + away > 20) problem("match score", `${m.competition} ${m.fixtureId} ${home}-${away} on ${date}`);
      y.matches++; y.goals += home + away;
      y.shots += (m.teamStats?.home?.shots ?? 0) + (m.teamStats?.away?.shots ?? 0);
    }
    if ((log?.registrationViolations ?? 0) > 0) problem("registration violation", `${log!.registrationViolations} on ${date}`);
    y.transfers += log?.transfers?.length ?? 0;

    const month = after.slice(0, 7);
    if (month !== lastMonth) {
      lastMonth = month;
      await checkWorld(saveId, after, month);
      await checkSeat(saveId, month);
      const elapsed = (Date.now() - t0) / 60000;
      console.log(`… ${after}  (${elapsed.toFixed(0)} min, problems ${problems.length})`);
    }
    if (after.slice(0, 4) !== lastYear) {
      const { squads } = await checkWorld(saveId, after, `year ${lastYear}`);
      await summary(saveId, lastYear, y, squads);
      lastYear = after.slice(0, 4);
      y = newYear();
    }
  }
  const { squads } = await checkWorld(saveId, endDate, "end");
  await checkSeat(saveId, "end");
  await summary(saveId, lastYear, y, squads);
} catch (e) {
  problem("run stopped", (e as Error).message);
} finally {
  console.log(`\n=== ${problems.length} kinds of problem in ${((Date.now() - t0) / 3.6e6).toFixed(1)} h`);
  for (const [k, n] of counts) console.log(`  ${k}: ${n}`);
  if (!KEEP) { await saveService.deleteSave(saveId).catch(() => {}); console.log("save deleted"); }
  else console.log(`save kept: ${saveId}`);
}
process.exit(problems.length ? 1 : 0);

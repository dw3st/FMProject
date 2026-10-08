import { readdir } from "fs/promises";
import { fileURLToPath } from "url";
import { buildStaffNameBook, type StaffNameBook } from "@/Domain/staff/staffOrigin";
import type { Squad } from "@/types/playerTypes";

/**
 * The coaching staff's name book (`@/Domain/staff/staffOrigin`), built once per process from the
 * base world (`src/Data/squads`, the same world every save starts from) so it never depends on which
 * save was loaded first. Also the league → country map the callers need for a club's home country.
 */

const DATA_DIR = fileURLToPath(new URL("../Data", import.meta.url));

let cached: Promise<StaffNameBook> | null = null;

export async function leagueCountryMap(): Promise<Map<string, string>> {
  const { getLeagueData } = await import("@/backend/advanceDay");
  return new Map((await getLeagueData()).filter((l) => l.country).map((l) => [l.slug, l.country!]));
}

async function load(): Promise<StaffNameBook> {
  const countries = await leagueCountryMap();
  const root = `${DATA_DIR}/squads`;
  const glob = new Bun.Glob("*.json");
  const squads: Parameters<typeof buildStaffNameBook>[0] = [];
  for (const d of await readdir(root, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const country = countries.get(d.name) ?? "";
    const files: string[] = [];
    for await (const f of glob.scan(`${root}/${d.name}`)) files.push(f);
    for (const f of files.sort()) {
      const sq = (await Bun.file(`${root}/${d.name}/${f}`).json()) as Squad;
      squads.push({ country, players: sq.players.map((p) => ({
        // The world data carries `fullName` (not part of `RosterPlayer`).
        name: p.name, fullName: (p as { fullName?: string }).fullName, nationality: p.nationality ?? undefined,
      })) });
    }
  }
  return buildStaffNameBook(squads);
}

export function getStaffNameBook(): Promise<StaffNameBook> {
  cached ??= load().catch((e) => {
    cached = null;
    throw e;
  });
  return cached;
}

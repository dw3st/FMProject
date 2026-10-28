import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { countByRole, MIN_BY_ROLE, replaceAfterSale, roleOf } from "@/Domain/contracts/freeAgents";
import { humanBuyBlocked, squadDepthBlocked } from "@/Domain/transfer/transferAcceptance";
import type { Squad } from "@/types/playerTypes";

const dir = "src/Data/squads/bundesliga/";
const lev: Squad = readdirSync(dir).map(f => JSON.parse(readFileSync(dir + f, "utf8")) as Squad).find(s => s.name === "Bayer Leverkusen")!;

test("a club at a role minimum sells to a human and signs a replacement the same day (report: Leverkusen)", () => {
  const mid = lev.players.find(p => roleOf(p) === "Midfielder")!;
  const squad: Squad = { ...lev, players: [...lev.players.filter(p => roleOf(p) !== "Midfielder"), ...lev.players.filter(p => roleOf(p) === "Midfielder").slice(0, MIN_BY_ROLE.Midfielder)] };
  expect(squadDepthBlocked(mid, squad, false)).toBe(true);       // the AI market still keeps its minimums
  expect(humanBuyBlocked(mid, squad)).toBe(false);               // a human buyer is not refused
  const sold: Squad = { ...squad, players: squad.players.filter(p => p.id !== mid.id) };
  const r = replaceAfterSale(sold, [], "2027-05-30", "t1")!;
  expect(countByRole(r.squad.players).Midfielder).toBe(MIN_BY_ROLE.Midfielder);
  expect(r.squad.players.length).toBe(squad.players.length);    // only the missing role, no top-up
  expect(replaceAfterSale(squad, [], "2027-05-30", "t2")).toBeNull();
});

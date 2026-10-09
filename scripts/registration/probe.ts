/**
 * Registration probe for `market-sim.ts --registration` (`.claude/rules/game/registration.md` → Medição): the AI
 * league lists follow the real refresh rule each day (rebuilt with the window open when the squad changed), and every
 * AI fee signing is checked once its buyer's window closes — still at the club and not registered = "left out".
 */
import { aiRefresh, type CompInfo } from "@/Domain/registration/lists";
import { registeredSet, ruleFor } from "@/Domain/registration/rules";
import { registrationStatus } from "@/Domain/registration/deadlines";
import { financialTierOf } from "@/Domain/aiFinance/aiClubFinance";
import type { WindowStatus } from "@/Domain/market/windows";
import type { FinancialTier, Squad } from "@/types/playerTypes";

interface Pending { playerId: string; buyer: string; tier: FinancialTier }

export function createRegistrationProbe(args: {
  countryOf: (league: string) => string;
  continentOf: (country: string) => string | undefined;
}) {
  const pending: Pending[] = [];
  const result = new Map<FinancialTier, { bought: number; out: number }>();
  const infoOf = (squad: Squad, date: string, season: string, window: WindowStatus): CompInfo => {
    const league = squad.leagueSlug ?? "";
    const country = args.countryOf(league);
    return {
      slug: league, kind: "league", season,
      rule: ruleFor(league, league, country, args.continentOf(country)),
      ctx: { seasonStartYear: parseInt(season, 10), countryOfLeague: args.countryOf, country, squadId: squad.id },
      status: registrationStatus({ kind: "league", window, date }),
    };
  };
  return {
    /** Records the day's AI fee signings. */
    bought(txs: { player: { id: string }; buyerSquad: Squad }[]) {
      for (const tx of txs) pending.push({ playerId: tx.player.id, buyer: tx.buyerSquad.id, tier: financialTierOf(tx.buyerSquad) });
    },
    /** One day: refresh every AI list, then check the signings whose buyer's window just closed. */
    day(squads: Squad[], date: string, season: string, statusOf: (league: string) => WindowStatus): Squad[] {
      const next = squads.map((s) => {
        const info = infoOf(s, date, season, statusOf(s.leagueSlug ?? ""));
        return aiRefresh(s, info, date).squad;
      });
      const byId = new Map(next.map((s) => [s.id, s] as const));
      for (let i = pending.length - 1; i >= 0; i--) {
        const p = pending[i]!;
        const squad = byId.get(p.buyer);
        if (!squad) { pending.splice(i, 1); continue; }
        const window = statusOf(squad.leagueSlug ?? "");
        if (window.open) continue;
        pending.splice(i, 1);
        if (!squad.players.some((x) => x.id === p.playerId)) continue;
        const info = infoOf(squad, date, season, window);
        const set = registeredSet(squad, info.slug, info.rule, info.ctx, season);
        const r = result.get(p.tier) ?? { bought: 0, out: 0 };
        r.bought++;
        if (!set || !set.has(p.playerId)) r.out++;
        result.set(p.tier, r);
      }
      return next;
    },
    summary(): string {
      const lines: string[] = [];
      let b = 0, o = 0;
      for (const [tier, r] of [...result.entries()].sort()) {
        b += r.bought; o += r.out;
        lines.push(`    ${tier.padEnd(6)} ${String(r.bought).padStart(5)} signings, ${String(r.out).padStart(4)} unregistered (${(100 * r.out / Math.max(1, r.bought)).toFixed(1)}%)`);
      }
      lines.unshift(`  registration: ${b} AI fee signings checked at the close of the buyer's window, ${o} unregistered (${(100 * o / Math.max(1, b)).toFixed(1)}%)`);
      return lines.join("\n");
    },
  };
}

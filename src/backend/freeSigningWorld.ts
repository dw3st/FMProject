import type { SaveService } from "@/backend/SaveService";
import { prestigeOf } from "@/backend/rivalWorld";
import { topIdsOf } from "@/backend/starLimitWorld";
import { contractDemand } from "@/Domain/contracts/contracts";
import { starterChance, type PreferenceInput } from "@/Domain/negotiation/rivals";
import {
  freeSigningProfileIds, freeSigningRivals, signingBonusAsk, type FreeSigningKind, type FreeSigningRival,
} from "@/Domain/negotiation/freeSigning";
import type { RosterPlayer, Squad } from "@/types/playerTypes";

/** What a fee-free signing costs the human club this week (4.47.9): the bonus asked and the AI clubs after him. */
export interface FreeSigningContext {
  ask: number;
  rivals: { rival: FreeSigningRival; pref: PreferenceInput }[];
}

/**
 * Reads the world market and the squads with a need for him, then `freeSigningRivals` and the bonus asked. `from` = his
 * club (pre-contract) or last club (free agent).
 */
export async function freeSigningContext(
  service: SaveService, saveId: string, args: { player: RosterPlayer; kind: FreeSigningKind; from: Squad | null; date: string },
): Promise<FreeSigningContext> {
  const { player, kind, from, date } = args;
  const market = await service.getWorldMarket(saveId);
  const profiles = market?.profiles ?? {};
  const humans = await service.humanClubIds(saveId);
  const ids = freeSigningProfileIds(player, profiles).filter((id) => !humans.has(id) && id !== from?.id);
  const squads = new Map<string, Squad>();
  for (const id of ids) {
    const s = await service.getSquadById(saveId, id);
    if (s) squads.set(id, s);
  }
  const rivals = freeSigningRivals({
    player, kind, date, fromId: from?.id ?? null, humanIds: humans, profiles, squadOf: (id) => squads.get(id),
    top: await topIdsOf(saveId),
  });
  const prestige = await prestigeOf(service, saveId, date, rivals.map((r) => r.clubId));
  return {
    ask: signingBonusAsk(player, kind, rivals.length),
    rivals: rivals.map((rival) => {
      const squad = squads.get(rival.clubId)!;
      return {
        rival,
        pref: {
          wage: rival.wage,
          demand: contractDemand(player, squad, date, { fromSquad: from, freeArrival: true }),
          prestige: prestige.get(rival.clubId) ?? 0.5,
          starter: starterChance(player, squad),
        },
      };
    }),
  };
}

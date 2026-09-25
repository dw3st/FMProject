import { saveService } from "@/backend/SaveService";
import { getSaveDataVersion } from "@/backend/dal/saveDataVersion";
import { topPlayerIds } from "@/Domain/world/stars";

interface StarsIndex {
  key: string;
  playerIds: string[];
}

/** One entry per save being played; a save's world doesn't change until its data version bumps. */
const cache = new Map<string, StarsIndex>();

/** In-flight builds keyed by `saveId#key`, so concurrent requests share one `getAllSquads` scan. */
const inFlight = new Map<string, Promise<StarsIndex>>();

/**
 * Sequence number of the build most recently committed to `cache`, per save. A build started
 * earlier (lower seq) can still finish after a later one (e.g. a slow `getAllSquads` scan racing
 * a fast one for a newer key) — without this guard, its stale result would overwrite the newer
 * cached entry once it resolves.
 */
const committedSeq = new Map<string, number>();
let nextSeq = 0;

async function buildStarsIndex(saveId: string, key: string, seq: number): Promise<StarsIndex> {
  const squads = await saveService.getAllSquads(saveId);
  const entry: StarsIndex = { key, playerIds: [...topPlayerIds(squads)] };
  // Only commit if nothing newer has landed in the meantime.
  if (seq >= (committedSeq.get(saveId) ?? -1)) {
    cache.set(saveId, entry);
    committedSeq.set(saveId, seq);
  }
  return entry;
}

/**
 * Ids of the top-50 (by `Player.computeOverallAvg`) players in the save's world, cached per save
 * and invalidated when the save's data (any squad/market write) or current date changes.
 */
export async function getStarPlayerIds(saveId: string): Promise<string[] | null> {
  const meta = await saveService.getMeta(saveId);
  if (!meta) return null;
  const key = `${meta.currentDate ?? ""}#${getSaveDataVersion(saveId)}`;
  const hit = cache.get(saveId);
  if (hit && hit.key === key) return hit.playerIds;

  const flightKey = `${saveId}#${key}`;
  const pending = inFlight.get(flightKey);
  if (pending) return (await pending).playerIds;

  const seq = nextSeq++;
  const promise = buildStarsIndex(saveId, key, seq).finally(() => {
    inFlight.delete(flightKey);
  });
  inFlight.set(flightKey, promise);
  return (await promise).playerIds;
}

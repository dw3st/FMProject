import { useEffect, useState } from "react";
import { FREE_REACTIONS } from "@/Domain/rivals/reactionShop";
import type { ReactionId } from "@/types/rivalsTypes";

/** Reactions the manager may send (free + bought + unlocked), one request per save, refreshed after a purchase. */
const cache = new Map<string, Promise<ReactionId[]>>();
const CHANGED = "fm:reactions-changed";

function load(saveId: string): Promise<ReactionId[]> {
  let p = cache.get(saveId);
  if (!p) {
    p = fetch(`/api/saves/${saveId}/manager-reactions`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { owned?: ReactionId[] } | null) => d?.owned ?? [...FREE_REACTIONS])
      .catch(() => [...FREE_REACTIONS]);
    cache.set(saveId, p);
  }
  return p;
}

export function reactionsChanged(saveId: string): void {
  cache.delete(saveId);
  window.dispatchEvent(new CustomEvent(CHANGED, { detail: saveId }));
}

export function useOwnedReactions(saveId: string): readonly ReactionId[] {
  const [owned, setOwned] = useState<readonly ReactionId[]>(FREE_REACTIONS);
  useEffect(() => {
    let alive = true;
    const read = () => void load(saveId).then((o) => { if (alive) setOwned(o); });
    read();
    const on = (e: Event) => { if ((e as CustomEvent<string>).detail === saveId) read(); };
    window.addEventListener(CHANGED, on);
    return () => { alive = false; window.removeEventListener(CHANGED, on); };
  }, [saveId]);
  return owned;
}

import { useCallback, useEffect, useState } from "react";
import { fetchCraft, type CallResult, type CraftView } from "@/GameInterface/Craft/craftApi";

/**
 * The craft view of the seat's club, and `run` for an action that answers with a new view (or with
 * `{ view }`): the view is replaced, the error code kept for the screen.
 */
export function useCraft(saveId: string) {
  const [view, setView] = useState<CraftView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchCraft(saveId).then((r) => {
      if (cancelled) return;
      if (r.ok) { setView(r.data); setLoadError(null); } else setLoadError(r.error);
    });
    return () => { cancelled = true; };
  }, [saveId]);

  const run = useCallback(async <T>(action: () => Promise<CallResult<T>>, pick: (d: T) => CraftView): Promise<T | null> => {
    setBusy(true);
    setActionError(null);
    const r = await action();
    setBusy(false);
    if (!r.ok) { setActionError(r.error); return null; }
    setView(pick(r.data));
    return r.data;
  }, []);

  return { view, loadError, actionError, setActionError, busy, run };
}

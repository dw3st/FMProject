import { useEffect, useRef, useState } from "react";
import { Send, Check, X } from "lucide-react";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import { saveCustomScenario } from "@/lab/pages/promo/scenarios";
import type { GameState } from "@/GameEngine/types";

/**
 * Floating button shown on lab pages where a live engine is running (eg /test).
 * On click:
 *   1. Captures the latest GameState from gameBus.stateChanged
 *   2. Saves it as a custom scenario in localStorage under id "from-test"
 *   3. Opens /promo?scenario=from-test in a reusable tab (PROMO_TAB_NAME),
 *      so repeated clicks update the same /promo window
 *
 * Hidden when the URL contains `?nav=hide`.
 */

const PROMO_TRANSFER_ID = "from-test";
const PROMO_TAB_NAME    = "promo-preview";

function isHidden(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("nav") === "hide";
}

export function SendToPromoButton() {
  const liveStateRef = useRef<GameState | null>(null);
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  useEffect(() => {
    const unsub = gameBus.on("stateChanged", (s) => {
      liveStateRef.current = s;
    });
    return () => unsub();
  }, []);

  if (isHidden()) return null;

  const send = () => {
    const state = liveStateRef.current;
    if (!state) {
      setFlash({
        kind: "err",
        msg: "Run the engine for one tick first",
      });
      window.setTimeout(() => setFlash(null), 2200);
      return;
    }
    try {
      saveCustomScenario(
        {
          id: PROMO_TRANSFER_ID,
          label: "From /test",
          description: `Captured ${new Date().toLocaleTimeString()} · t=${state.matchTime.toFixed(1)}s`,
        },
        state,
      );
      // Use a named target so clicking again reuses the same /promo tab
      // instead of opening N copies. The user can iterate fast: tweak on
      // /test → click → switch back to the still-open /promo tab.
      window.open(
        `/promo?scenario=${PROMO_TRANSFER_ID}`,
        PROMO_TAB_NAME,
      );
      setFlash({ kind: "ok", msg: "Sent to /promo" });
      window.setTimeout(() => setFlash(null), 1800);
    } catch (err) {
      setFlash({
        kind: "err",
        msg: err instanceof Error ? err.message : "Failed",
      });
      window.setTimeout(() => setFlash(null), 2200);
    }
  };

  return (
    <div className="fixed top-[58px] right-3 z-[9998] flex items-center gap-2">
      <button
        type="button"
        onClick={send}
        className="card-arcade border-glow glow-primary-sm rounded-full px-4 py-2 flex items-center gap-2 cursor-pointer hover:scale-[1.03] active:scale-[0.98] transition-transform"
        title="Capture current engine state and open /promo with it"
      >
        <Send className="w-3.5 h-3.5 text-primary" />
        <span className="text-[10px] font-display font-black uppercase tracking-[0.2em] text-primary glow-text">
          Send to /promo
        </span>
      </button>

      {flash && (
        <div
          className={
            "card-arcade rounded-full px-3 py-1.5 flex items-center gap-1.5 " +
            (flash.kind === "ok"
              ? "text-primary glow-text"
              : "text-destructive")
          }
        >
          {flash.kind === "ok" ? (
            <Check className="w-3 h-3" />
          ) : (
            <X className="w-3 h-3" />
          )}
          <span className="text-[10px] uppercase tracking-widest font-display font-bold">
            {flash.msg}
          </span>
        </div>
      )}
    </div>
  );
}

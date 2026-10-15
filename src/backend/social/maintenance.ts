import { logError } from "@/Logger";
import { sweepStatuses } from "@/backend/social/realtime";
import { purgeOldMessages } from "@/backend/social/socialStore";

const PURGE_EVERY_MS = 24 * 60 * 60 * 1000;
const SWEEP_EVERY_MS = 30_000;

/** Daily 90-day cleanup (also once at start) and the 30-second presence sweep. Returns a stop function. */
export function startSocialMaintenance(): () => void {
  const purge = () => {
    try {
      purgeOldMessages(Date.now());
    } catch (e) {
      logError("social", "purge of old chat messages failed", e);
    }
  };
  purge();
  const purgeTimer = setInterval(purge, PURGE_EVERY_MS);
  const sweepTimer = setInterval(() => sweepStatuses(Date.now()), SWEEP_EVERY_MS);
  return () => {
    clearInterval(purgeTimer);
    clearInterval(sweepTimer);
  };
}

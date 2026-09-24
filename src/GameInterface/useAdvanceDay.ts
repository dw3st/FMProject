import { useState, useCallback } from "react";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { updateSessionCurrentDate } from "@/GameInterface/gameSession";
import { useKeybinds } from "@/GameInterface/useKeybinds";
import type { AdvanceDayResponse } from "@/types/dayLogTypes";

export function useAdvanceDay() {
  const { session, squad, fixtures, currentDate: simDate, refresh } = useGameSave();

  const [advancing, setAdvancing] = useState(false);
  const [dayLog, setDayLog] = useState<AdvanceDayResponse | null>(null);

  const handleAdvanceDay = useCallback(async () => {
    if (!session || advancing) return;

    const mySquadId = squad?.id ?? session.clubId;
    const todayFixture = fixtures.find(
      (f) =>
        f.date === simDate &&
        (f.home === mySquadId || f.away === mySquadId) &&
        !f.played,
    );
    if (todayFixture) {
      window.location.href = "/match-preview";
      return;
    }

    setAdvancing(true);
    try {
      const res = await fetch(`/api/advance-day/${session.saveId}`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to advance day");
      const log = (await res.json()) as AdvanceDayResponse;
      setDayLog(log);
    } catch {
      // silently fail for now
    } finally {
      setAdvancing(false);
    }
  }, [session, squad?.id, advancing, fixtures, simDate]);

  const dismissDayLog = useCallback(() => {
    if (dayLog?.newDate) {
      updateSessionCurrentDate(dayLog.newDate);
    }
    setDayLog(null);
    void refresh();
  }, [dayLog, refresh]);

  useKeybinds("dashboard", { advanceDay: handleAdvanceDay });

  return { handleAdvanceDay, advancing, dayLog, dismissDayLog };
}

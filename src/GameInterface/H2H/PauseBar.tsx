import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/GameInterface/ui/Button";
import { Icon } from "@/GameInterface/Icons";
import { pauseClock } from "@/GameInterface/H2H/h2hState";
import type { H2HSide } from "@/types/h2hTypes";

/**
 * The pause of a live match between two managers (multiplayer part 7): who paused and the time left; only the one
 * who paused can resume before the end.
 */
export function PauseBar({ pause, mySide, names, onResume }: {
  pause: { by: H2HSide; until: number };
  mySide: H2HSide;
  names: Record<H2HSide, string>;
  onResume: () => void;
}) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  return (
    <div role="status" className="flex items-center justify-center gap-3 px-4 py-2 border-b border-border bg-chart-4/10">
      <Icon name="pause" size={16} className="text-chart-4" />
      <span className="text-sm font-semibold text-foreground tabular-nums">
        {t("h2h.pausedBy", { name: names[pause.by], time: pauseClock(pause.until, now) })}
      </span>
      {pause.by === mySide && (
        <Button onClick={onResume}>
          <Icon name="play" size={16} />
          {t("h2h.resume")}
        </Button>
      )}
    </div>
  );
}

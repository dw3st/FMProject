import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { IBERO_PASSPORT_MIN_AGE } from "@/Domain/registration/registrationConfig";
import type { ForeignCheckView } from "@/types/registrationTypes";

/** Whether a player from outside the club would take a foreign place in the human club's league (`registration/check`). */
export function useForeignCheck(saveId: string | undefined, playerId: string | null, fromSquadId: string | undefined): ForeignCheckView | null {
  const [check, setCheck] = useState<ForeignCheckView | null>(null);
  useEffect(() => {
    setCheck(null);
    if (!saveId || !playerId) return;
    let alive = true;
    const from = encodeURIComponent(fromSquadId ?? "");
    fetch(`/api/saves/${saveId}/registration/check/${encodeURIComponent(playerId)}?from=${from}`)
      .then((r) => (r.ok ? (r.json() as Promise<ForeignCheckView>) : null))
      .then((d) => { if (alive) setCheck(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, [saveId, playerId, fromSquadId]);
  return check;
}

/** The sentence for a check, or null when there is nothing to say (domestic, EU, or no cap). */
export function foreignCheckText(check: ForeignCheckView, competition: string, t: TFunction): string | null {
  const base = { competition, age: IBERO_PASSPORT_MIN_AGE };
  if (check.basis === "ibero") return t("registration.check.exemptIbero", base);
  if (check.basis === "acp") return t("registration.check.exemptAcp", base);
  if (check.basis === "greenCard") return t("registration.check.greenCard", base);
  if (!check.foreign) return null;
  if (check.max != null) {
    const key = check.basis === "outsideEU" || check.basis === "iberoUnderAge" ? "registration.check.foreignNonEU" : "registration.check.foreign";
    const line = t(key, { ...base, used: check.used, max: check.max });
    return check.used >= check.max ? `${line} ${t("registration.check.full")}` : line;
  }
  if (check.matchday != null) return t("registration.check.matchday", { ...base, n: check.matchday });
  return null;
}

/** One line under a player from another club (profile, negotiation): his foreign status in the user's league. */
export function ForeignCheckLine({ playerId, fromSquadId }: { playerId: string | null; fromSquadId: string | undefined }) {
  const { t } = useTranslation();
  const { session } = useGameSave();
  const check = useForeignCheck(session?.saveId, playerId, fromSquadId);
  if (!check || !session) return null;
  const text = foreignCheckText(check, session.leagueName, t);
  if (!text) return null;
  const full = check.foreign && check.max != null && check.used >= check.max;
  return <p className={`text-sm m-0 ${full ? "text-chart-4" : "text-muted-foreground"}`}>{text}</p>;
}

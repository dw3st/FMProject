import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { Label } from "@/GameInterface/ui/Label";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";

type ContractsOwner = "director" | "manager";
type ScoutingOwner = "manager" | "chief";
interface Owners { contracts: ContractsOwner; scouting: ScoutingOwner }

/**
 * Responsibilities of the human club (`.claude/rules/game/responsibilities.md`): who handles the
 * contracts (the director or the manager) and who plans the scouting missions (the manager or the
 * chief scout).
 */
export function ResponsibilitiesPanel({ saveId }: { saveId: string }) {
  const { t } = useTranslation();
  const [owners, setOwners] = useState<Owners | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/saves/${saveId}/responsibilities`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((j: Owners) => { if (alive) setOwners(j); })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [saveId]);

  async function choose(patch: Partial<Owners>) {
    setBusy(true);
    setError(false);
    try {
      const res = await fetch(`/api/saves/${saveId}/responsibilities`, {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error();
      setOwners((await res.json()) as Owners);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  const line = (active: boolean) => (active ? "text-foreground" : "text-muted-foreground");

  return (
    <section className="flex flex-col gap-3">
      <SectionTitle>{t("responsibilities.title")}</SectionTitle>
      <p className="text-sm text-muted-foreground m-0">{t("responsibilities.subtitle")}</p>
      {owners === null && !error ? (
        <p className="text-sm text-muted-foreground m-0">{t("responsibilities.loading")}</p>
      ) : owners && (
        <>
          <div className="rounded-md border border-border p-3 flex flex-col gap-3 max-w-2xl">
            <Label>{t("responsibilities.contracts.label")}</Label>
            <OptionChips<ContractsOwner>
              aria-label={t("responsibilities.contracts.label")}
              options={[
                { key: "director", label: t("responsibilities.owner.director") },
                { key: "manager", label: t("responsibilities.owner.manager") },
              ]}
              value={owners.contracts}
              onChange={(k) => { if (k !== owners.contracts) void choose({ contracts: k }); }}
              disabled={busy}
            />
            <ul className="m-0 pl-0 list-none flex flex-col gap-1 text-sm">
              <li className={line(owners.contracts === "director")}>{t("responsibilities.contracts.director")}</li>
              <li className={line(owners.contracts === "manager")}>{t("responsibilities.contracts.manager")}</li>
            </ul>
          </div>
          <div className="rounded-md border border-border p-3 flex flex-col gap-3 max-w-2xl">
            <Label>{t("responsibilities.scouting.label")}</Label>
            <OptionChips<ScoutingOwner>
              aria-label={t("responsibilities.scouting.label")}
              options={[
                { key: "manager", label: t("responsibilities.owner.manager") },
                { key: "chief", label: t("responsibilities.owner.chief") },
              ]}
              value={owners.scouting}
              onChange={(k) => { if (k !== owners.scouting) void choose({ scouting: k }); }}
              disabled={busy}
            />
            <ul className="m-0 pl-0 list-none flex flex-col gap-1 text-sm">
              <li className={line(owners.scouting === "manager")}>{t("responsibilities.scouting.manager")}</li>
              <li className={line(owners.scouting === "chief")}>{t("responsibilities.scouting.chief")}</li>
            </ul>
          </div>
        </>
      )}
      {error && <p className="text-sm text-destructive m-0">{t("warnings.errors.loadFailed")}</p>}
    </section>
  );
}

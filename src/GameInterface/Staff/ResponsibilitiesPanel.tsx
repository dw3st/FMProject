import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { Label } from "@/GameInterface/ui/Label";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";

type ContractsOwner = "director" | "manager";

/**
 * Responsibilities of the human club (`.claude/rules/game/responsibilities.md`): who handles the
 * contracts — the director (renewals and contract talks on his own) or the manager.
 */
export function ResponsibilitiesPanel({ saveId }: { saveId: string }) {
  const { t } = useTranslation();
  const [contracts, setContracts] = useState<ContractsOwner | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/saves/${saveId}/responsibilities`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((j: { contracts: ContractsOwner }) => { if (alive) setContracts(j.contracts); })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [saveId]);

  async function choose(next: ContractsOwner) {
    if (next === contracts) return;
    setBusy(true);
    setError(false);
    try {
      const res = await fetch(`/api/saves/${saveId}/responsibilities`, {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ contracts: next }),
      });
      if (!res.ok) throw new Error();
      setContracts(((await res.json()) as { contracts: ContractsOwner }).contracts);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <SectionTitle>{t("responsibilities.title")}</SectionTitle>
      <p className="text-sm text-muted-foreground m-0">{t("responsibilities.subtitle")}</p>
      <div className="rounded-md border border-border p-3 flex flex-col gap-3 max-w-2xl">
        <Label>{t("responsibilities.contracts.label")}</Label>
        {contracts === null && !error ? (
          <p className="text-sm text-muted-foreground m-0">{t("responsibilities.loading")}</p>
        ) : (
          <>
            <OptionChips<ContractsOwner>
              aria-label={t("responsibilities.contracts.label")}
              options={[
                { key: "director", label: t("responsibilities.owner.director") },
                { key: "manager", label: t("responsibilities.owner.manager") },
              ]}
              value={contracts}
              onChange={(k) => void choose(k)}
              disabled={busy}
            />
            <ul className="m-0 pl-0 list-none flex flex-col gap-1 text-sm">
              <li className={contracts === "director" ? "text-foreground" : "text-muted-foreground"}>
                {t("responsibilities.contracts.director")}
              </li>
              <li className={contracts === "manager" ? "text-foreground" : "text-muted-foreground"}>
                {t("responsibilities.contracts.manager")}
              </li>
            </ul>
          </>
        )}
        {error && <p className="text-sm text-destructive m-0">{t("warnings.errors.loadFailed")}</p>}
      </div>
    </section>
  );
}

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { Button } from "@/GameInterface/ui/Button";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { fetchFoundClub, type FoundClubOptions } from "@/GameInterface/OwnClub/ownClubApi";
import { FoundClubWizard } from "@/GameInterface/OwnClub/FoundClubWizard";

/** "Found your own club" (`.claude/rules/game/own-club.md`): locked until every achievement is unlocked. */
export function FoundClubCard({ saveId }: { saveId: string }) {
  const { t } = useTranslation();
  const { save } = useGameSave();
  const [data, setData] = useState<FoundClubOptions | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const r = await fetchFoundClub(saveId);
    setData(r.ok ? r.data : null);
  }, [saveId]);
  useEffect(() => { void load(); }, [load]);

  if (!data) return null;
  const founded = data.foundedClub;
  const foundedName = founded && save?.clubId === founded.squadId ? save.clubName : null;
  const pct = data.total > 0 ? Math.min(100, (data.done / data.total) * 100) : 0;

  return (
    <section className={`card-arcade rounded-md p-4 flex flex-wrap items-center gap-4 ${data.unlocked || founded ? "" : "opacity-70"}`}>
      <span className={`inline-flex w-12 h-12 shrink-0 items-center justify-center rounded-full border border-border ${data.unlocked || founded ? "text-primary" : "text-muted-foreground"}`}>
        <Icon name={data.unlocked || founded ? "building" : "lock"} size={22} />
      </span>
      <div className="flex flex-col gap-2 min-w-0 flex-1">
        <SectionTitle>{t("ownClub.card.title")}</SectionTitle>
        {founded ? (
          <p className="text-sm text-foreground m-0">
            {foundedName ? t("ownClub.card.foundedNamed", { club: foundedName }) : t("ownClub.card.founded")}
          </p>
        ) : data.unlocked ? (
          <p className="text-sm text-muted-foreground m-0">{t("ownClub.card.unlocked")}</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground m-0 tabular-nums">{t("ownClub.card.locked", { done: data.done, total: data.total })}</p>
            <div className="h-1.5 w-full max-w-md rounded bg-border overflow-hidden" role="presentation">
              <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
          </>
        )}
      </div>
      {data.unlocked && !founded && (
        <Button onClick={() => setOpen(true)}>{t("ownClub.card.found")}</Button>
      )}
      {open && <FoundClubWizard saveId={saveId} options={data} onClose={() => { setOpen(false); void load(); }} />}
    </section>
  );
}

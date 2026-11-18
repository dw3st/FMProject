// Up to 3 badges at the top of the account profile: the tracks with the gold.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/GameInterface/Components/Modal";
import { Chip } from "@/GameInterface/ui/Chip";
import { Button } from "@/GameInterface/ui/Button";
import { saveAccountBadges } from "@/GameInterface/Account/accountApi";
import type { AccountProfileView, AccountTrackId } from "@/types/accountTypes";

const MAX = 3;

export function BadgePicker({ open, view, onClose, onSaved }: {
  open: boolean;
  view: AccountProfileView;
  onClose: () => void;
  onSaved: (badges: AccountTrackId[]) => void;
}) {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<AccountTrackId[]>(view.badges);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => { if (open) { setPicked(view.badges); setError(false); } }, [open, view.badges]);
  const gold = view.achievements.tracks.filter((x) => x.tier === "gold").map((x) => x.id);

  function toggle(id: AccountTrackId) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX ? p : [...p, id]));
  }

  async function save() {
    setBusy(true);
    const saved = await saveAccountBadges(picked);
    setBusy(false);
    if (!saved) { setError(true); return; }
    onSaved(saved);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} size="sm">
      <div className="p-5 flex flex-col gap-4">
        <h2 className="font-display font-black uppercase text-xl leading-none m-0">{t("account.badges.title")}</h2>
        <p className="text-sm text-muted-foreground m-0">{t("account.badges.hint", { count: MAX })}</p>
        <div className="flex flex-wrap gap-2">
          {gold.map((id) => (
            <Chip key={id} selected={picked.includes(id)} onClick={() => toggle(id)}>{t(`account.badge.${id}`)}</Chip>
          ))}
        </div>
        {error && <p role="alert" className="text-sm text-destructive m-0">{t("account.badges.error")}</p>}
        <div className="flex justify-end gap-4">
          <button type="button" onClick={onClose} className="h-10 cursor-pointer border-0 bg-transparent px-2 text-sm font-semibold text-muted-foreground hover:text-foreground">{t("common.cancel")}</button>
          <Button onClick={() => void save()} disabled={busy}>{t("common.save")}</Button>
        </div>
      </div>
    </Modal>
  );
}

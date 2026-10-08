import { useTranslation } from "react-i18next";
import { Modal } from "@/GameInterface/Components/Modal";
import { Button } from "@/GameInterface/ui/Button";
import { Label } from "@/GameInterface/ui/Label";
import { ScoutCountriesPanel } from "@/GameInterface/Scouting/ScoutCountriesPanel";

/** The scout's country map in a modal (Central de Olheiros → Missões). */
export function ScoutCountriesModal({ saveId, memberId, name, onClose }: {
  saveId: string;
  /** Staff member id; `null` = closed. */
  memberId: string | null;
  name: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal open={!!memberId} onClose={onClose} size="xl">
      <div className="p-6 flex flex-col gap-5">
        <div>
          <Label>{t("scoutCountries.scout")}</Label>
          <p className="font-display font-black uppercase text-xl leading-none m-0 mt-1">{name}</p>
        </div>
        {memberId && <ScoutCountriesPanel saveId={saveId} memberId={memberId} />}
        <div className="flex justify-end">
          <Button variant="secondary" flush onClick={onClose}>{t("common.close")}</Button>
        </div>
      </div>
    </Modal>
  );
}

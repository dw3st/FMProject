import { useTranslation } from "react-i18next";
import { Modal } from "@/GameInterface/Components/Modal";
import { Button } from "@/GameInterface/ui/Button";
import { Label } from "@/GameInterface/ui/Label";
import { PlayerKnowledgePanel } from "@/GameInterface/Scouting/PlayerKnowledgePanel";

/** The player's knowledge block in a window: send a scout to watch him to a level, straight from a report row (tester report bd9823b3). */
export function ObserveModal({ saveId, target, onClose }: {
  saveId: string;
  /** The player to watch; `null` = closed. */
  target: { playerId: string; squadId: string; name: string } | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal open={!!target} onClose={onClose} size="lg">
      <div className="p-6 flex flex-col gap-5">
        <div>
          <Label>{t("scouting.observeTitle")}</Label>
          <p className="font-display font-black uppercase text-xl leading-none m-0 mt-1">{target?.name}</p>
        </div>
        {target && <PlayerKnowledgePanel saveId={saveId} playerId={target.playerId} squadId={target.squadId} />}
        <div className="flex justify-end">
          <Button variant="secondary" flush onClick={onClose}>{t("common.close")}</Button>
        </div>
      </div>
    </Modal>
  );
}

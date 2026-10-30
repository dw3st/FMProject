/**
 * Quick view of a free agent from the scout search (tester report, 4.41.25): a free agent has no player page (no
 * club), so his name opens the scouted card here (attributes as the scouts see them) with the signing button.
 */
import { useTranslation } from "react-i18next";
import { Modal } from "@/GameInterface/Components/Modal";
import { PlayerCard } from "@/GameInterface/Dashboard/PlayerCard";
import { Button } from "@/GameInterface/ui/Button";
import { Icon } from "@/GameInterface/Icons";
import type { DisplayPlayer } from "@/Domain/scout/displayPlayer";

export function FreeAgentQuickView({ player, onClose, onSign }: {
  player: DisplayPlayer | null;
  onClose: () => void;
  onSign: (player: DisplayPlayer) => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal open={player !== null} onClose={onClose} size="xl">
      {player && (
        <div className="p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">
              {t("scout.quickView.freeAgent")}
            </span>
            <Button variant="secondary" flush onClick={onClose} aria-label={t("common.close")}>
              <Icon name="close" size={16} />
            </Button>
          </div>
          <PlayerCard player={player} layout="wide" />
          <div className="flex justify-end">
            <Button variant="primary" onClick={() => onSign(player)}>
              <Icon name="user-plus" size={16} />
              {t("scout.table.sign")}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

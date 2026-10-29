import { useState } from "react";
import { DialogTitle } from "@headlessui/react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/GameInterface/Components/Modal";
import { ManagerRenewalCard } from "@/GameInterface/Components/ManagerRenewalCard";
import { Button } from "@/GameInterface/ui/Button";

const SEEN_KEY = "fm.renewalPopup.seen";

function seen(id: string): boolean {
  try {
    return sessionStorage.getItem(SEEN_KEY) === id;
  } catch {
    return false;
  }
}

/**
 * The board's renewal offer pops up on the dashboard (a critical decision a manager missed in the inbox, 4.41.2):
 * once per offer and browser session; "Decide later" closes it, the inbox card stays.
 */
export function RenewalPopup({ saveId, renewal, currentDate, onAnswered }: {
  saveId: string;
  renewal: { offeredOn: string; expires: string; wage: number; seasons: number } | null | undefined;
  currentDate: string | null;
  onAnswered: () => void;
}) {
  const { t } = useTranslation();
  const id = renewal ? `${saveId}:${renewal.offeredOn}` : "";
  const live = !!renewal && !!currentDate && renewal.expires >= currentDate;
  const [closed, setClosed] = useState(false);
  if (!live || closed || seen(id)) return null;
  const close = () => {
    try {
      sessionStorage.setItem(SEEN_KEY, id);
    } catch {
      // the popup just comes back next time
    }
    setClosed(true);
  };
  return (
    <Modal open onClose={close} size="md">
      <div className="p-6 space-y-4">
        <DialogTitle className="font-display font-black uppercase text-xl leading-none m-0">{t("managerContract.popupTitle")}</DialogTitle>
        <p className="text-sm text-muted-foreground m-0">{t("managerContract.popupBody")}</p>
        <ManagerRenewalCard saveId={saveId} renewal={renewal} onAnswered={() => { onAnswered(); }} />
        <div className="flex justify-end">
          <Button variant="secondary" onClick={close}>{t("managerContract.popupLater")}</Button>
        </div>
      </div>
    </Modal>
  );
}

import { DialogTitle } from "@headlessui/react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/GameInterface/Components/Modal";
import { Icon } from "@/GameInterface/Icons";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  busy?: boolean;
}

/**
 * Shared destructive-action confirmation dialog, built on the project-standard `Modal`
 * (Esc/backdrop close, focus trap). Use instead of `window.confirm` for anything
 * destructive (e.g. deleting a save) — see ReportModal.tsx for the same pattern.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
  busy = false,
}: ConfirmDialogProps) {
  const { t } = useTranslation();

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} size="sm">
      <div className="p-6 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="shrink-0 p-2 rounded-lg bg-destructive/10 text-destructive">
            <Icon name="alert" size={20} />
          </span>
          <DialogTitle as="h2" className="text-lg font-bold font-display text-foreground m-0">
            {title}
          </DialogTitle>
        </div>
        <p className="text-sm text-muted-foreground m-0">{body}</p>
        <div className="flex justify-end gap-2 mt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground transition-colors cursor-pointer bg-transparent border-0 disabled:opacity-50 font-display"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-[0.08em] bg-destructive text-destructive-foreground hover:opacity-90 transition-opacity cursor-pointer border-0 disabled:opacity-50 font-display"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

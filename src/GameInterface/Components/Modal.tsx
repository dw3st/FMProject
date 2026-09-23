import { Dialog, DialogBackdrop, DialogPanel } from "@headlessui/react";
import type { ReactNode } from "react";

const sizeClass = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-3xl",
  xl: "max-w-4xl",
} as const;

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  size?: keyof typeof sizeClass;
  /** Merged onto the dialog panel. Use for fixed height + inner scroll (e.g. day summary). */
  panelClassName?: string;
}

/**
 * Project-standard modal built on top of headlessui Dialog.
 * Handles focus trapping, Escape-to-close, backdrop click, and scroll lock.
 *
 * Usage:
 *   <Modal open={open} onClose={onClose} size="lg" panelClassName="optional overrides">
 *     ...content...
 *   </Modal>
 */
export function Modal({ open, onClose, children, size = "lg", panelClassName }: ModalProps) {
  const defaultPanel =
    "card-arcade rounded-2xl border-glow w-full max-h-[90vh] overflow-y-auto";
  const mergedPanel = panelClassName
    ? `card-arcade rounded-2xl border-glow w-full ${sizeClass[size]} ${panelClassName}`
    : `${defaultPanel} ${sizeClass[size]}`;

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      {/* Backdrop */}
      <DialogBackdrop className="fixed inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Centering wrapper */}
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className={mergedPanel}>{children}</DialogPanel>
      </div>
    </Dialog>
  );
}

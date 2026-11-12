import { Dialog, DialogBackdrop, DialogPanel } from "@headlessui/react";
import type { MouseEvent, ReactNode } from "react";
import { interceptedTarget } from "@/GameInterface/router/appRoutes";
import { isFrameActive, navigate } from "@/GameInterface/router/navigation";

const sizeClass = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-3xl",
  xl: "max-w-4xl",
  /** The end-of-season report. */
  report: "max-w-[1080px]",
  /** Almost the whole screen (a friend's match broadcast). */
  wide: "max-w-[min(1400px,95vw)]",
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
    "card-arcade rounded-md w-full max-h-[90vh] overflow-y-auto";
  const mergedPanel = panelClassName
    ? `card-arcade rounded-md w-full ${sizeClass[size]} ${panelClassName}`
    : `${defaultPanel} ${sizeClass[size]}`;

  // A link inside the dialog (the inbox's blue action buttons) never reaches the frame's document listener: the
  // dialog takes the click first and the browser loaded the whole page again, footer and radio included (10.0.1,
  // tester report). Frame paths change in place here and close the dialog.
  const onPanelClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!isFrameActive() || e.defaultPrevented) return;
    const a = (e.target as Element | null)?.closest?.("a");
    if (!a) return;
    const to = interceptedTarget(e, { href: a.href, target: a.target, hasDownload: a.hasAttribute("download") }, window.location.origin);
    if (!to) return;
    e.preventDefault();
    onClose();
    navigate(to);
  };

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      {/* Backdrop */}
      <DialogBackdrop className="fixed inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Centering wrapper */}
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className={mergedPanel} onClick={onPanelClick}>{children}</DialogPanel>
      </div>
    </Dialog>
  );
}

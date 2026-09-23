import {
  Popover as HPopover,
  PopoverButton,
  PopoverPanel,
} from "@headlessui/react";
import type { ReactNode } from "react";

type PopoverSide = "top" | "bottom" | "left" | "right";

interface PopoverProps {
  trigger: ReactNode;
  content: ReactNode;
  side?: PopoverSide;
  gap?: number;
}

const ANCHOR_TO: Record<PopoverSide, "top" | "bottom" | "left" | "right"> = {
  top: "top",
  bottom: "bottom",
  left: "left",
  right: "right",
};

/**
 * Project-standard popover built on top of headlessui Popover.
 * Handles click-outside, Escape-to-close, and focus management.
 *
 * Usage:
 *   <Popover trigger={<button>open</button>} content={<p>hello</p>} side="bottom" />
 */
export function Popover({ trigger, content, side = "bottom", gap = 8 }: PopoverProps) {
  return (
    <HPopover className="relative inline-flex">
      <PopoverButton as="div" className="cursor-pointer outline-none">
        {trigger}
      </PopoverButton>

      <PopoverPanel
        portal
        anchor={{ to: ANCHOR_TO[side], gap }}
        className="z-[9999] min-w-max outline-none"
        style={{
          animation: "popover-in 0.15s cubic-bezier(0.16, 1, 0.3, 1) both",
        }}
      >
        <div className="rounded-xl border border-border bg-popover shadow-[0_8px_32px_rgba(0,0,0,0.5)] p-3">
          {content}
        </div>
      </PopoverPanel>
    </HPopover>
  );
}

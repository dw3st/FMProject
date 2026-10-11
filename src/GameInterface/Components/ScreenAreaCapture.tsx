import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/GameInterface/ui/Button";
import {
  containRect, selectionRect, sourceCrop, type Point, type Rect,
} from "@/GameInterface/Components/screenCaptureGeometry";
import { ATTACHMENT_MAX_BYTES } from "@/GameInterface/Components/reportAttachmentValidation";

// "Capture a screen area" of the tester report (#125): the browser's screen-share picker grabs one
// frame of the tab, then an overlay lets the tester drag the rectangle to attach. No dependency:
// `getDisplayMedia` + a canvas. Without `getDisplayMedia` the option is not offered.

/** True when the browser can capture the screen (desktop Chrome/Edge/Firefox/Safari). */
export function canCaptureScreen(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getDisplayMedia === "function";
}

/** Opens the browser's share picker (the current tab first where supported). Must run inside the click. */
export function requestScreenStream(): Promise<MediaStream> {
  const options = {
    video: { displaySurface: "browser" },
    audio: false,
    preferCurrentTab: true,
    selfBrowserSurface: "include",
  } as DisplayMediaStreamOptions;
  return navigator.mediaDevices.getDisplayMedia(options);
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** One frame of the stream on a canvas; the stream is always stopped. `delayMs` lets the page
 *  repaint (the report window is hidden first) before the frame is taken. */
export async function grabFrame(stream: MediaStream, delayMs = 250): Promise<HTMLCanvasElement> {
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    await nextFrame();
    await nextFrame();
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx || canvas.width === 0 || canvas.height === 0) throw new Error("empty frame");
    ctx.drawImage(video, 0, 0);
    video.srcObject = null;
    return canvas;
  } finally {
    for (const track of stream.getTracks()) track.stop();
  }
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** The cropped area as an attachable file: PNG, or JPEG when the PNG is over the 2 MB limit. */
export async function cropToFile(source: HTMLCanvasElement, crop: Rect): Promise<File | null> {
  const out = document.createElement("canvas");
  out.width = crop.w;
  out.height = crop.h;
  const ctx = out.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
  const png = await canvasBlob(out, "image/png");
  if (png && png.size <= ATTACHMENT_MAX_BYTES) return new File([png], "captura.png", { type: "image/png" });
  const jpeg = await canvasBlob(out, "image/jpeg", 0.85);
  return jpeg ? new File([jpeg], "captura.jpg", { type: "image/jpeg" }) : null;
}

interface SelectorProps {
  frame: HTMLCanvasElement;
  onDone: (crop: Rect) => void;
  onCancel: () => void;
}

/** Full-screen overlay showing the captured frame; dragging a rectangle picks the area. */
export function ScreenAreaSelector({ frame, onDone, onCancel }: SelectorProps) {
  const { t } = useTranslation();
  const src = useMemo(() => frame.toDataURL("image/png"), [frame]);
  const [start, setStart] = useState<Point | null>(null);
  const [end, setEnd] = useState<Point | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const pointOf = (e: ReactPointerEvent<HTMLDivElement>): Point => {
    const r = boxRef.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  };

  const finish = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!start) return;
    const box = boxRef.current?.getBoundingClientRect();
    const sel = selectionRect(start, pointOf(e));
    setStart(null);
    setEnd(null);
    if (!box) return;
    const shown = containRect(frame.width, frame.height, box.width, box.height);
    const crop = sourceCrop(sel, shown, frame.width, frame.height);
    if (crop) onDone(crop);
  };

  const sel = start && end ? selectionRect(start, end) : null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("reports.captureTitle")}
      className="fixed inset-0 z-[100] bg-background select-none"
    >
      <div
        ref={boxRef}
        className="absolute inset-0 cursor-crosshair touch-none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          const p = pointOf(e);
          setStart(p);
          setEnd(p);
        }}
        onPointerMove={(e) => {
          if (start) setEnd(pointOf(e));
        }}
        onPointerUp={finish}
        onPointerCancel={() => {
          setStart(null);
          setEnd(null);
        }}
      >
        <img src={src} alt="" draggable={false} className="pointer-events-none h-full w-full object-contain" />
        {sel ? (
          <div
            className="pointer-events-none absolute border-2 border-primary shadow-[0_0_0_9999px_rgb(0_0_0/0.55)]"
            style={{ left: sel.x, top: sel.y, width: sel.w, height: sel.h }}
          />
        ) : (
          <div className="pointer-events-none absolute inset-0 bg-black/40" />
        )}
      </div>
      <div className="absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-3 rounded-md border border-border bg-card px-4 py-2">
        <span className="text-sm text-foreground">{t("reports.captureHint")}</span>
        <Button variant="secondary" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </div>
    </div>,
    document.body,
  );
}

import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Wordmark } from "@/GameInterface/Components/Wordmark";
import { useFullscreen } from "@/GameInterface/pwa/appInstall";
import { Button } from "@/GameInterface/ui/Button";

const MIN_WIDTH = 1024;
const MIN_HEIGHT = 600;
/** A phone lying down plays the compact layout (9.8): landscape, at least this size. */
const PHONE_MIN_WIDTH = 640;
const PHONE_MIN_HEIGHT = 320;

type Fit = "ok" | "rotate" | "small";

function screenFit(): Fit {
  if (typeof window === "undefined") return "ok";
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (w >= MIN_WIDTH && h >= MIN_HEIGHT) return "ok";
  if (w > h && w >= PHONE_MIN_WIDTH && h >= PHONE_MIN_HEIGHT) return "ok";
  // A phone held upright: it fits once turned.
  if (h > w && h >= PHONE_MIN_WIDTH && w >= PHONE_MIN_HEIGHT) return "rotate";
  return "small";
}

export function ScreenSizeGate({ children }: { children: ReactNode }) {
  const [fit, setFit] = useState<Fit>(() => screenFit());

  useEffect(() => {
    const check = () => setFit(screenFit());
    check();
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);

  if (fit !== "ok") return <UnsupportedScreen rotate={fit === "rotate"} />;
  return <>{children}</>;
}

function UnsupportedScreen({ rotate }: { rotate: boolean }) {
  const { t } = useTranslation();
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const fullscreen = useFullscreen();

  useEffect(() => {
    const update = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background text-foreground p-6 overflow-auto">
      <div className="max-w-md w-full text-center">
        <Wordmark size="lg" className="block mb-8" />
        <h1 className="font-display font-black uppercase tracking-tight text-3xl md:text-4xl leading-none mb-3">
          {t(rotate ? "unsupportedScreen.rotateTitle" : "unsupportedScreen.title")}
        </h1>
        <p className="text-sm text-muted-foreground m-0">
          {rotate
            ? t("unsupportedScreen.rotateText")
            : <>{t("unsupportedScreen.current")} {size.w} × {size.h} · {t("unsupportedScreen.minimum")} {MIN_WIDTH} × {MIN_HEIGHT}</>}
        </p>
        {rotate && fullscreen.supported && !fullscreen.active && (
          <Button onClick={fullscreen.toggle} className="mt-6">{t("unsupportedScreen.fullscreen")}</Button>
        )}
      </div>
    </div>
  );
}

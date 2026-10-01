import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Wordmark } from "@/GameInterface/Components/Wordmark";

const MIN_WIDTH = 1024;
const MIN_HEIGHT = 600;

function isScreenTooSmall(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth < MIN_WIDTH || window.innerHeight < MIN_HEIGHT;
}

export function ScreenSizeGate({ children }: { children: ReactNode }) {
  const [tooSmall, setTooSmall] = useState<boolean>(() => isScreenTooSmall());

  useEffect(() => {
    const check = () => setTooSmall(isScreenTooSmall());
    check();
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);

  if (tooSmall) return <UnsupportedScreen />;
  return <>{children}</>;
}

function UnsupportedScreen() {
  const { t } = useTranslation();
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });

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
        <Wordmark size="md" className="block mb-8" />
        <h1 className="text-xl font-semibold mb-2">{t("unsupportedScreen.title")}</h1>
        <p className="text-sm text-muted-foreground m-0">
          {t("unsupportedScreen.current")} {size.w} × {size.h} · {t("unsupportedScreen.minimum")} {MIN_WIDTH} × {MIN_HEIGHT}
        </p>
      </div>
    </div>
  );
}

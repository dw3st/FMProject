import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Monitor } from "lucide-react";

const MIN_WIDTH = 1200;
const MIN_HEIGHT = 900;

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
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 border border-primary/30 mb-6">
          <Monitor className="w-7 h-7 text-primary" />
        </div>

        <div className="inline-block mb-5">
          <span className="px-3 py-1 bg-primary/20 border border-primary/50 rounded text-[10px] font-bold uppercase tracking-widest text-primary">
            {t("unsupportedScreen.badge")}
          </span>
        </div>

        <h1 className="text-2xl font-black font-display uppercase mb-3 tracking-wide">
          {t("unsupportedScreen.title")}
        </h1>

        <p className="text-muted-foreground text-sm leading-relaxed mb-6">
          {t("unsupportedScreen.description")}
        </p>

        <div className="rounded-lg border border-border/30 bg-card/20 p-4 text-left">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-muted-foreground uppercase tracking-wider">
              {t("unsupportedScreen.minimum")}
            </span>
            <span className="font-mono font-bold text-foreground">
              {MIN_WIDTH} × {MIN_HEIGHT}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground uppercase tracking-wider">
              {t("unsupportedScreen.current")}
            </span>
            <span className="font-mono font-bold text-destructive">
              {size.w} × {size.h}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

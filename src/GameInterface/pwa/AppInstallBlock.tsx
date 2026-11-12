import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { useAppInstall, useFullscreen } from "@/GameInterface/pwa/appInstall";
import { Button } from "@/GameInterface/ui/Button";
import { OptionChips } from "@/GameInterface/ui/OptionChips";

const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground";

/** Settings: install the game as an app, and play full screen in the browser (10.6). */
export function AppInstallBlock() {
  const { t } = useTranslation();
  const { state, install } = useAppInstall();
  const fullscreen = useFullscreen();

  return (
    <>
      <div className="mt-6 flex flex-col gap-2">
        <div className={LABEL}>{t("settings.app.title")}</div>
        {state === "prompt" && (
          <Button onClick={() => void install()} className="self-start">
            <Icon name="download" size={16} />
            {t("settings.app.install")}
          </Button>
        )}
        <p className="m-0 text-sm text-muted-foreground">{t(`settings.app.${state}`)}</p>
      </div>

      {fullscreen.supported && state !== "installed" && (
        <div className="mt-6 flex flex-col gap-2">
          <div className={LABEL}>{t("settings.app.fullscreen")}</div>
          <OptionChips
            value={fullscreen.active ? "on" : "off"}
            onChange={(k) => { if ((k === "on") !== fullscreen.active) fullscreen.toggle(); }}
            options={[{ key: "on", label: t("settings.newVisualOn") }, { key: "off", label: t("settings.newVisualOff") }]}
          />
          <p className="m-0 text-sm text-muted-foreground">{t("settings.app.fullscreenDescription")}</p>
        </div>
      )}
    </>
  );
}

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { NewGameWizard } from "@/GameInterface/NewGameWizard";
import { PitchBackdrop } from "@/GameInterface/Components/PitchBackdrop";
import { Wordmark } from "@/GameInterface/Components/Wordmark";
import { Button } from "@/GameInterface/ui/Button";
import { Notice } from "@/GameInterface/ui/Notice";
import { ScreenTitle } from "@/GameInterface/ui/ScreenTitle";
import { loadGameSave } from "@/GameInterface/gameSession";
import { worldApi, type WorldApiError } from "@/GameInterface/World/worldApi";
import { joinCodeFromPath } from "@/GameInterface/World/worldNav";
import type { WorldByCode } from "@/types/multiplayerTypes";

type Stage =
  | { kind: "loading" }
  | { kind: "error"; error: WorldApiError }
  | { kind: "member"; saveId: string }
  | { kind: "info"; world: WorldByCode }
  | { kind: "wizard"; world: WorldByCode };

/** `/join/:code`: the world behind an invite link, then the new-game wizard in join mode. */
export function JoinScreen() {
  const { t } = useTranslation();
  const code = joinCodeFromPath(window.location.pathname);
  const [stage, setStage] = useState<Stage>({ kind: "loading" });
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    void worldApi.byCode(code).then((r) => {
      if (r.ok) setStage({ kind: "info", world: r.data });
      else if (r.error === "alreadyMember" && r.saveId) setStage({ kind: "member", saveId: r.saveId });
      else setStage({ kind: "error", error: r.error });
    });
  }, [code]);

  if (stage.kind === "wizard") {
    return <NewGameWizard join={{ code, worldName: stage.world.name, takenClubs: stage.world.takenClubs }} />;
  }

  async function openWorld(saveId: string) {
    setOpening(true);
    try {
      await loadGameSave(saveId);
      window.location.href = "/world";
    } catch {
      setOpening(false);
    }
  }

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-background">
      <PitchBackdrop />
      <div className="relative w-full max-w-[480px] px-4">
        <Wordmark size="lg" className="mb-8 block text-center" />
        <ScreenTitle>{t("world.join.title")}</ScreenTitle>
        <div className="mt-6 flex flex-col gap-4">
          {stage.kind === "loading" && <p className="text-sm text-muted-foreground m-0">{t("common.loading")}</p>}
          {stage.kind === "error" && (
            <>
              <Notice kind="error">{t(`world.errors.${stage.error}`)}</Notice>
              <Button variant="secondary" flush onClick={() => { window.location.href = "/start"; }}>{t("world.join.toStart")}</Button>
            </>
          )}
          {stage.kind === "member" && (
            <>
              <Notice>{t("world.errors.alreadyMember")}</Notice>
              <Button onClick={() => void openWorld(stage.saveId)} disabled={opening}>{t("world.join.open")}</Button>
            </>
          )}
          {stage.kind === "info" && (
            <>
              <div className="rounded-md border border-border bg-card p-4">
                <p className="font-display font-black uppercase text-xl leading-none m-0">{stage.world.name}</p>
                <p className="text-sm text-muted-foreground mt-2 mb-0">{t("world.join.owner", { name: stage.world.owner })}</p>
                <p className="text-sm text-muted-foreground m-0 tabular-nums">
                  {t("world.members.count", { count: stage.world.members, max: stage.world.max })}
                  {" · "}
                  {t(`world.status.${stage.world.phase}`)}
                </p>
              </div>
              <Button onClick={() => setStage({ kind: "wizard", world: stage.world })}>{t("world.join.choose")}</Button>
              <Button variant="secondary" flush onClick={() => { window.location.href = "/start"; }}>{t("world.join.toStart")}</Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FaceImage } from "@/GameInterface/Components/PlayerFace";
import { newVisualOn, paintedNews } from "@/Domain/art/paintedFaces";

export type RenewalOutcome =
  | { kind: "renewed"; detail: string }
  | { kind: "refused"; detail: string };

/**
 * Result of a renewal (tester report; option C of the mock of 2026-11-05): a painted scene (handshake when he signs, the
 * player alone at the desk when he refuses) with a card of his own face and name over it. Without the art, his face
 * with a green or red ring.
 */
export function RenewalResult({
  outcome, name, faceSrc, fallback, onClose, onRetry,
}: {
  outcome: RenewalOutcome; name: string; faceSrc: string; fallback: string; onClose: () => void; onRetry?: () => void;
}) {
  const { t } = useTranslation();
  const happy = outcome.kind === "renewed";
  const [sceneFailed, setSceneFailed] = useState(false);
  const scene = newVisualOn() && !sceneFailed ? paintedNews(happy ? "renewal-happy" : "renewal-sad") : null;
  const ring = happy ? "border-[3px] border-emerald-400" : "border-[3px] border-destructive";
  const faceTone = happy ? "" : "grayscale-[65%] brightness-90";
  const verdict = (
    <span className={`font-display font-bold uppercase leading-none ${happy ? "text-emerald-400" : "text-destructive"} ${scene ? "text-2xl" : "text-3xl"}`}>
      {happy ? t("contracts.result.renewed") : t("contracts.result.refused")}
    </span>
  );
  return (
    <div className="flex flex-col" role="status">
      {scene ? (
        <div className="relative">
          <img src={scene} alt={happy ? t("contracts.result.sceneHappy") : t("contracts.result.sceneSad")}
            onError={() => setSceneFailed(true)} className="block w-full max-w-full aspect-[720/408] object-cover" />
          <div className="absolute left-4 bottom-3.5 flex items-center gap-3 rounded-lg border border-border bg-background/85 py-2 pl-2 pr-4">
            <FaceImage src={faceSrc} size={64} fallback={fallback} ringClassName={ring} className={faceTone} />
            <div className="flex flex-col gap-1">
              {verdict}
              <span className="font-semibold text-foreground">{name}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 pt-6">
          <FaceImage src={faceSrc} size={96} fallback={fallback} ringClassName={ring} className={faceTone} />
          {verdict}
          <span className="font-semibold text-foreground">{name}</span>
        </div>
      )}
      <div className={`flex flex-col gap-4 px-6 py-5 ${scene ? "" : "items-center text-center"}`}>
        <p className="text-sm text-muted-foreground tabular-nums m-0">{outcome.detail}</p>
        <div className="flex items-center justify-end gap-4">
          {onRetry && (
            <button type="button" onClick={onRetry}
              className="h-10 px-2 border-0 bg-transparent text-sm font-semibold text-muted-foreground hover:text-foreground cursor-pointer">
              {t("contracts.result.retry")}
            </button>
          )}
          <button type="button" onClick={onClose}
            className="h-10 px-5 rounded bg-primary text-primary-foreground font-semibold text-sm cursor-pointer border-0">
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}

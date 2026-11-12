import { useState } from "react";
import LOGO_INDEX from "@/Data/logoIndex.json";
import LOGO_BACKING from "@/Data/logoBacking.json";
import { isSquareFlagUrl, squareFlagUrl } from "@/Domain/world/flags";
import { logoUrlFromIndex } from "@/Domain/world/logos";
import { nationalTeamFlagCode } from "@/Domain/world/nationalityFlag";
import { Icon } from "@/GameInterface/Icons";

/** Crests of thin dark lines that vanish on the dark background (`scripts/logoContrast.ts`): drawn on a light disc. */
const BACKED_URLS = new Set(
  (LOGO_BACKING as string[]).map((id) => logoUrlFromIndex(LOGO_INDEX as Record<string, string>, id)).filter(Boolean),
);

/** URLs that already 404'd this page load — avoid re-requesting them from every mounted instance. */
const failedLogoUrls = new Set<string>();

/**
 * Crest URL for a squad from the generated logo index (native SVG/PNG or the ESPN crest).
 * Returns undefined when the club has no crest, so the UI draws the colour shield without a request.
 * A national team (`nat_…`) has its country's square flag for a crest.
 */
export function squadLogoUrl(squadId: string): string | undefined {
  const flag = nationalTeamFlagCode(squadId);
  if (flag) return squareFlagUrl(flag);
  return logoUrlFromIndex(LOGO_INDEX as Record<string, string>, squadId);
}

/** Drops the clipping classes from a logo box when it shows a real crest image. */
function crestBoxClass(className: string): string {
  return className
    .split(/\s+/)
    .filter((c) => c && !/^rounded(-|$)/.test(c) && c !== "overflow-hidden")
    .join(" ");
}

/**
 * Renders a club logo image.
 * Falls back to a gradient shield if `logoUrl` is not provided or the image fails to load.
 */
export function ClubLogo({
  logoUrl,
  primaryColor = "#555",
  secondaryColor = "#888",
  className = "w-8 h-8",
  imgClassName = "w-full h-full object-contain p-1",
  title,
}: {
  /** Club name shown on hover (and read by screen readers) where the crest stands without the name. */
  title?: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  className?: string;
  imgClassName?: string;
}) {
  // Tracks only the specific URL that errored on this instance — derived (not mount-time) so a
  // reused instance whose `logoUrl` prop changes (e.g. a virtualized list row) doesn't keep
  // showing the fallback for a URL that never actually failed.
  const [failedUrl, setFailedUrl] = useState<string | undefined>(undefined);
  const failed = !!logoUrl && (failedLogoUrls.has(logoUrl) || failedUrl === logoUrl);

  if (logoUrl && !failed && isSquareFlagUrl(logoUrl)) {
    // A national team: the flag fills a disc with a thin light rim (a flag has no outline of its own).
    return (
      <div title={title} className={`${crestBoxClass(className)} flex items-center justify-center shrink-0`}>
        <img
          src={logoUrl}
          alt={title ?? ""}
          draggable={false}
          className="w-[84%] h-[84%] rounded-full object-cover ring-1 ring-white/40"
          onError={() => {
            failedLogoUrls.add(logoUrl);
            setFailedUrl(logoUrl);
          }}
        />
      </div>
    );
  }

  if (logoUrl && !failed) {
    // A real crest is never clipped (#53): a circular mask (`rounded-full` + `overflow-hidden`,
    // meant for the generated fallback shield) cuts the corners of square-topped crests such as
    // São Paulo's. The box keeps its size; the image is contained inside it.
    const backed = BACKED_URLS.has(logoUrl);
    return (
      <div title={title} className={`${crestBoxClass(className)} flex items-center justify-center shrink-0${backed ? " rounded-full bg-white/90" : ""}`}>
        <img
          src={logoUrl}
          alt={title ?? ""}
          draggable={false}
          // A thin light outline keeps dark crests (Juventus' black "J") readable on the dark
          // background; on light or coloured crests it is barely visible.
          className={`${imgClassName} max-w-full max-h-full object-contain [filter:drop-shadow(0_0_1px_rgba(255,255,255,0.6))_drop-shadow(0_0_1px_rgba(255,255,255,0.35))]`}
          onError={() => {
            failedLogoUrls.add(logoUrl);
            setFailedUrl(logoUrl);
          }}
        />
      </div>
    );
  }

  return (
    <div
      title={title}
      className={`${className} flex items-center justify-center overflow-hidden`}
      style={{ background: `linear-gradient(145deg, ${primaryColor} 0%, ${secondaryColor} 100%)` }}
    >
      <Icon name="shield" className="w-[50%] h-[50%] text-white" />
    </div>
  );
}

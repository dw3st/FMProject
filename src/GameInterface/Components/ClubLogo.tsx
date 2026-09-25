import { useState } from "react";
import { Shield } from "lucide-react";
import LOGO_INDEX from "@/Data/logoIndex.json";
import { logoUrlFromIndex } from "@/Domain/world/logos";

/** URLs that already 404'd this page load — avoid re-requesting them from every mounted instance. */
const failedLogoUrls = new Set<string>();

/** Returns the URL for a club's SVG logo. */
export function clubLogoUrl(league: string, club: string): string {
  return `/api/logos/${league}/${club}`;
}

/**
 * Crest URL for a squad from the generated logo index (native SVG/PNG or the ESPN crest).
 * Returns undefined when the club has no crest, so the UI draws the colour shield without a request.
 * `leagueSlug` / `clubSlug` are kept for the existing call sites and no longer used.
 */
export function squadLogoUrl(squadId: string, _leagueSlug?: string, _clubSlug?: string): string | undefined {
  return logoUrlFromIndex(LOGO_INDEX as Record<string, string>, squadId);
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
}: {
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

  if (logoUrl && !failed) {
    return (
      <div className={`${className} flex items-center justify-center overflow-hidden`}>
        <img
          src={logoUrl}
          alt=""
          className={imgClassName}
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
      className={`${className} flex items-center justify-center overflow-hidden`}
      style={{ background: `linear-gradient(145deg, ${primaryColor} 0%, ${secondaryColor} 100%)` }}
    >
      <Shield className="w-[50%] h-[50%] text-white drop-shadow-lg" />
    </div>
  );
}

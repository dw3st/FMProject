import { useState } from "react";
import { Shield } from "lucide-react";

/** Returns the URL for a club's SVG logo. */
export function clubLogoUrl(league: string, club: string): string {
  return `/api/logos/${league}/${club}`;
}

/** Logo URL from calendar/standings squad id. Prefers the club slug (how logos are filed on disk); falls back to squadId. */
export function squadLogoUrl(squadId: string, leagueSlug: string, clubSlug?: string): string {
  return clubLogoUrl(leagueSlug, clubSlug ?? squadId);
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
  const [failed, setFailed] = useState(false);

  if (logoUrl && !failed) {
    return (
      <div className={`${className} flex items-center justify-center overflow-hidden`}>
        <img src={logoUrl} alt="" className={imgClassName} onError={() => setFailed(true)} />
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

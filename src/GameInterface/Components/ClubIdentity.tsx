import { ClubLogo } from "@/GameInterface/Components/ClubLogo";

interface ClubColors {
  primaryColor: string;
  secondaryColor: string;
}

interface ClubIdentityProps extends ClubColors {
  clubName: string;
  shortName?: string;
  leagueName?: string;
  divisionName?: string;
  variant?: "sidebar" | "header" | "badge";
  showName?: boolean;
  showLeague?: boolean;
  logoUrl?: string;
}

export function ClubIdentity({
  variant = "sidebar",
  clubName,
  shortName,
  leagueName,
  divisionName,
  primaryColor,
  secondaryColor,
  showName = true,
  showLeague = true,
  logoUrl,
}: ClubIdentityProps) {
  if (variant === "badge") {
    return (
      <div className="flex items-center gap-3">
        <ClubLogo
          logoUrl={logoUrl}
          primaryColor={primaryColor}
          secondaryColor={secondaryColor}
          className="w-10 h-10 rounded-lg overflow-hidden"
          imgClassName="w-full h-full object-contain p-1"
        />
        {showName && (
          <div>
            <p className="font-bold text-foreground font-display text-sm m-0">{shortName ?? clubName}</p>
            {showLeague && leagueName && (
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider m-0">{leagueName}</p>
            )}
          </div>
        )}
      </div>
    );
  }

  if (variant === "header") {
    return (
      <div className="flex items-center gap-4">
        <div
          className="w-1 h-10 rounded-full"
          style={{ background: `linear-gradient(180deg, ${primaryColor} 0%, ${secondaryColor} 100%)` }}
        />
        <ClubLogo
          logoUrl={logoUrl}
          primaryColor={primaryColor}
          secondaryColor={secondaryColor}
          className="w-12 h-12 rounded-xl overflow-hidden border-2"
          imgClassName="w-full h-full object-contain p-1.5"
        />
        {showName && (
          <div>
            <p className="font-black text-foreground font-display text-lg tracking-wide m-0">{clubName}</p>
            {showLeague && (
              <p className="text-xs text-muted-foreground m-0">
                {leagueName}
                {divisionName && ` - ${divisionName}`}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        className="absolute inset-0 opacity-20 rounded-xl"
        style={{ background: `linear-gradient(180deg, ${primaryColor} 0%, transparent 100%)` }}
      />

      <div className="relative p-4 flex flex-col items-center gap-3">
        <ClubLogo
          logoUrl={logoUrl}
          primaryColor={primaryColor}
          secondaryColor={secondaryColor}
          className="w-24 h-24 rounded-xl overflow-hidden"
          imgClassName="w-full h-full object-contain p-2"
        />

        {showName && (
          <div className="text-center">
            <p className="font-black text-foreground font-display tracking-wide m-0">{clubName}</p>
            {showLeague && divisionName && (
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5 m-0">{divisionName}</p>
            )}
          </div>
        )}

        <div className="flex gap-1 mt-1">
          <div className="w-8 h-1 rounded-full" style={{ backgroundColor: primaryColor }} />
          <div className="w-4 h-1 rounded-full" style={{ backgroundColor: secondaryColor }} />
          <div className="w-2 h-1 rounded-full" style={{ backgroundColor: primaryColor }} />
        </div>
      </div>
    </div>
  );
}

export function ClubGradientAccent({ primaryColor, secondaryColor }: ClubColors) {
  return (
    <div
      className="h-1 w-full rounded-full"
      style={{
        background: `linear-gradient(90deg, ${primaryColor} 0%, ${secondaryColor} 50%, transparent 100%)`,
      }}
    />
  );
}

export function ClubBadge({
  primaryColor,
  secondaryColor,
  size = "md",
  logoUrl,
}: ClubColors & { size?: "sm" | "md" | "lg"; logoUrl?: string }) {
  const sizes = { sm: "w-6 h-6", md: "w-8 h-8", lg: "w-10 h-10" };

  return (
    <ClubLogo
      logoUrl={logoUrl}
      primaryColor={primaryColor}
      secondaryColor={secondaryColor}
      className={`${sizes[size]} rounded-lg overflow-hidden`}
      imgClassName="w-full h-full object-contain p-0.5"
    />
  );
}

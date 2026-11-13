import { useState } from "react";
import { Icon } from "@/GameInterface/Icons";
import { colorWithAlpha, isDarkPlate, sponsorPlateUrl } from "@/Domain/sponsors/sponsorPlate";
import { PLATE_BOX, plateNameClass, sectorIcon, type SponsorPlateSize } from "@/GameInterface/Sponsors/sponsorPlateStyle";

/** What the plate needs of a company (`SponsorBrand` and `MasterSponsor` both have it). */
export interface SponsorPlateCompany {
  id: string;
  name: string;
  sector: string;
  /** Hex colours: background, text. */
  colors: [string, string];
}

/** Plates that answered 404 (not painted yet): never asked again in this page. */
const missingPlates = new Set<string>();

/**
 * A company's logo (`.claude/rules/game/sponsors.md`): a plate in the brand's background colour with a symbol on the
 * left and the name in the brand's text colour. The symbol is the painted plate's left third when the image exists,
 * else the sector's icon. The colours are the company's own (the one use of inline style here).
 */
export function SponsorPlate({ company, size = "md", className = "" }: { company: SponsorPlateCompany; size?: SponsorPlateSize; className?: string }) {
  const url = sponsorPlateUrl(company.id);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [bg, fg] = company.colors;
  const box = PLATE_BOX[size];
  const border = isDarkPlate(bg) ? colorWithAlpha(fg, 0.35) : null;
  const painted = url !== null && failedUrl !== url && !missingPlates.has(url);
  return (
    <div
      role="img"
      aria-label={company.name}
      title={company.name}
      className={`relative inline-flex shrink-0 items-stretch overflow-hidden rounded border ${box.box} ${className}`}
      style={{ backgroundColor: bg, color: fg, borderColor: border ?? "transparent" }}
    >
      <div className={`relative shrink-0 flex items-center justify-center ${box.symbol}`}>
        {painted ? (
          <img
            src={url}
            alt=""
            loading="lazy"
            draggable={false}
            className="absolute inset-0 h-full w-full object-cover object-left"
            onError={() => { missingPlates.add(url); setFailedUrl(url); }}
          />
        ) : (
          <Icon name={sectorIcon(company.sector)} size={box.icon} strokeWidth={1.75} />
        )}
      </div>
      <div className="min-w-0 flex-1 flex items-center justify-center overflow-hidden pr-2 pl-0.5">
        <span className={`text-center line-clamp-2 [overflow-wrap:anywhere] ${plateNameClass(size, company.name)}`}>
          {company.name}
        </span>
      </div>
    </div>
  );
}

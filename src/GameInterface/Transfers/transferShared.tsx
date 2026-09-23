import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, XCircle } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import type { TransferRecord } from "@/types/transferTypes";
import { Popover } from "@/GameInterface/Components/Popover";
import {
  MAIN_ROLE_ABBR,
  MAIN_ROLE_BADGE_CLASSES,
  getMainRole,
} from "@/GameInterface/positionHelpers";

type TransferStatus = TransferRecord["status"];

const statusConfig: Record<TransferStatus, { icon: ComponentType<SVGProps<SVGSVGElement>>; labelKey: string; class: string }> = {
  accepted: { icon: CheckCircle2, labelKey: "transfers.complete", class: "text-emerald-400 bg-emerald-500/20 border-emerald-500/30" },
  rejected: { icon: XCircle,      labelKey: "transfers.rejected", class: "text-red-400 bg-red-500/20 border-red-500/30" },
};

const KNOWN_REJECT_CODES = new Set(["squadDepth", "playerImportant", "offerTooLow", "clubRejected"]);
const KNOWN_ACCEPT_CODES = new Set(["strongOffer", "willingToSell", "financial"]);

/** Translate a reason returned by the engine. Falls back to the raw string for legacy records. */
export function translateTransferReason(t: (key: string, opts?: Record<string, unknown>) => string, reason: string | undefined, accepted: boolean): string {
  if (!reason) return "";
  if (accepted && KNOWN_ACCEPT_CODES.has(reason)) {
    return t(`transfers.acceptReasons.${reason}`);
  }
  if (!accepted && KNOWN_REJECT_CODES.has(reason)) {
    return t(`transfers.rejectReasons.${reason}`);
  }
  return reason;
}

export function formatTransferFee(fee: number): string {
  const m = fee / 1_000_000;
  if (m >= 100) return `£${Math.round(m)}M`;
  if (m >= 1) return `£${m.toFixed(1)}M`;
  return `£${(fee / 1000).toFixed(0)}K`;
}

export function formatTransferDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function squadHref(league?: string, club?: string): string | null {
  if (!league || !club) return null;
  return `/squad/${encodeURIComponent(league)}/${encodeURIComponent(club)}`;
}

/** After an accepted deal the player is at `to`; if rejected they remain at `from`. */
function playerHref(record: TransferRecord): string | null {
  const { playerId, status } = record;
  if (status === "accepted") {
    if (record.toLeagueSlug && record.toClubSlug) {
      return `/player/${encodeURIComponent(record.toLeagueSlug)}/${encodeURIComponent(record.toClubSlug)}/${encodeURIComponent(playerId)}`;
    }
    if (record.fromLeagueSlug && record.fromClubSlug) {
      return `/player/${encodeURIComponent(record.fromLeagueSlug)}/${encodeURIComponent(record.fromClubSlug)}/${encodeURIComponent(playerId)}`;
    }
  } else {
    if (record.fromLeagueSlug && record.fromClubSlug) {
      return `/player/${encodeURIComponent(record.fromLeagueSlug)}/${encodeURIComponent(record.fromClubSlug)}/${encodeURIComponent(playerId)}`;
    }
  }
  return null;
}

function ClubLogo({ league, club }: { league?: string; club?: string }) {
  const [failed, setFailed] = useState(false);
  if (!league || !club || failed) {
    return <div className="w-7 h-7 rounded-md bg-muted/80 border border-border shrink-0" aria-hidden />;
  }
  const src = `/api/logos/${encodeURIComponent(league)}/${encodeURIComponent(club)}`;
  return (
    <img
      src={src}
      alt=""
      className="w-7 h-7 rounded-md object-contain bg-muted/50 border border-border shrink-0"
      onError={() => setFailed(true)}
    />
  );
}

function ClubLink({
  league,
  club,
  name,
}: {
  league?: string;
  club?: string;
  name: string;
}) {
  const href = squadHref(league, club);
  const inner = (
    <>
      <ClubLogo league={league} club={club} />
      <span>{name}</span>
    </>
  );
  if (!href) {
    return <span className="inline-flex items-center gap-1 align-middle">{inner}</span>;
  }
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1 align-middle text-foreground hover:text-primary hover:underline no-underline"
    >
      {inner}
    </a>
  );
}

export function TransferRow({ record }: { record: TransferRecord }) {
  const { t } = useTranslation();
  const cfg = statusConfig[record.status];
  const cfgLabel = t(cfg.labelKey);
  const reasonText = translateTransferReason(t, record.reason, record.status === "accepted");
  const StatusIcon = cfg.icon;
  const pHref = playerHref(record);
  const rawPos = record.playerPosition;
  const hasPos = Boolean(rawPos && rawPos !== "—");
  const mainRole = hasPos ? getMainRole(rawPos) : null;
  const posBadgeClass =
    mainRole != null
      ? (MAIN_ROLE_BADGE_CLASSES[mainRole] ?? "bg-muted/20 text-muted-foreground border-border")
      : "bg-muted/20 text-muted-foreground border-border";

  const statusBadge =
    record.status === "rejected" ? (
      <Popover
        side="top"
        gap={6}
        trigger={
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full border flex items-center gap-1 cursor-help ${cfg.class}`}
          >
            <StatusIcon className="w-3 h-3" />
            {cfgLabel}
          </span>
        }
        content={
          <p className="text-sm text-foreground max-w-xs m-0 leading-snug">{reasonText}</p>
        }
      />
    ) : (
      <span className={`text-[10px] px-2 py-0.5 rounded-full border flex items-center gap-1 ${cfg.class}`}>
        <StatusIcon className="w-3 h-3" />
        {cfgLabel}
      </span>
    );

  return (
    <div className="p-4 hover:bg-muted/30 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span
              className={`text-[9px] font-black px-1.5 py-0.5 rounded border uppercase tracking-wider shrink-0 ${posBadgeClass}`}
              title={hasPos ? rawPos : undefined}
            >
              {mainRole != null ? MAIN_ROLE_ABBR[mainRole] : "—"}
            </span>
            {pHref ? (
              <a
                href={pHref}
                className="font-bold text-foreground hover:text-primary hover:underline no-underline min-w-0"
              >
                {record.playerName}
              </a>
            ) : (
              <span className="font-bold text-foreground min-w-0">{record.playerName}</span>
            )}
            <span className="text-xs text-muted-foreground">{record.playerAge}y</span>
          </div>
          <p className="text-xs text-muted-foreground m-0 leading-snug">
            <ClubLink league={record.fromLeagueSlug} club={record.fromClubSlug} name={record.fromSquadName} />
            <span className="text-muted-foreground/80 mx-0.5">→</span>
            <ClubLink league={record.toLeagueSlug} club={record.toClubSlug} name={record.toSquadName} />
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-black font-display text-primary m-0">{formatTransferFee(record.fee)}</p>
          <div className="flex items-center gap-1.5 mt-1 justify-end flex-wrap">
            {statusBadge}
            <span className="text-[10px] text-muted-foreground">{formatTransferDate(record.date)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

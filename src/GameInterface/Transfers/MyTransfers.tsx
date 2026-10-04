import { useTranslation } from "react-i18next";
import type { TransferRecord } from "@/types/transferTypes";
import { TransferRow } from "@/GameInterface/Transfers/transferShared";
import { formatFee } from "@/Domain/money";
import { Icon } from "@/GameInterface/Icons";

function byDateDesc(a: TransferRecord, b: TransferRecord): number {
  return b.date.localeCompare(a.date);
}

function partitionClubTransfers(
  records: TransferRecord[],
  playerSquadId: string | null,
): { incoming: TransferRecord[]; outgoing: TransferRecord[] } {
  if (playerSquadId) {
    const incoming = records.filter((r) => r.toSquadId === playerSquadId).sort(byDateDesc);
    const outgoing = records.filter((r) => r.fromSquadId === playerSquadId).sort(byDateDesc);
    return { incoming, outgoing };
  }
  const incoming = records.filter((r) => r.direction === "in").sort(byDateDesc);
  const outgoing = records.filter((r) => r.direction === "out").sort(byDateDesc);
  return { incoming, outgoing };
}

function totalsForClub(
  records: TransferRecord[],
  playerSquadId: string | null,
): { spent: number; earned: number } {
  if (playerSquadId) {
    const spent = records
      .filter((r) => r.status === "accepted" && r.toSquadId === playerSquadId)
      .reduce((s, r) => s + r.fee, 0);
    const earned = records
      .filter((r) => r.status === "accepted" && r.fromSquadId === playerSquadId)
      .reduce((s, r) => s + r.fee, 0);
    return { spent, earned };
  }
  const incoming = records.filter((r) => r.direction === "in");
  const outgoing = records.filter((r) => r.direction === "out");
  const spent = incoming.filter((r) => r.status === "accepted").reduce((s, r) => s + r.fee, 0);
  const earned = outgoing.filter((r) => r.status === "accepted").reduce((s, r) => s + r.fee, 0);
  return { spent, earned };
}

export function MyTransfers({
  records,
  playerSquadId,
}: {
  records: TransferRecord[];
  playerSquadId: string | null;
}) {
  const { t } = useTranslation();
  const { incoming, outgoing } = partitionClubTransfers(records, playerSquadId);
  const { spent: totalSpent, earned: totalEarned } = totalsForClub(records, playerSquadId);
  const net = totalEarned - totalSpent;

  if (records.length === 0) {
    return (
      <div className="card-arcade rounded-md p-12 text-center">
        <p className="text-muted-foreground text-sm m-0">
          {t("transfers.noTransfers")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card-arcade rounded-md p-4">
          <p className="text-[13px] uppercase tracking-[0.08em] text-muted-foreground mb-1 m-0 font-display font-bold">{t("transfers.totalSpent")}</p>
          <p className="text-2xl font-black font-display text-destructive m-0 tabular-nums">{formatFee(totalSpent)}</p>
        </div>
        <div className="card-arcade rounded-md p-4">
          <p className="text-[13px] uppercase tracking-[0.08em] text-muted-foreground mb-1 m-0 font-display font-bold">{t("transfers.totalEarned")}</p>
          <p className="text-2xl font-black font-display text-chart-2 m-0 tabular-nums">{formatFee(totalEarned)}</p>
        </div>
        <div className="card-arcade rounded-md p-4">
          <p className="text-[13px] uppercase tracking-[0.08em] text-muted-foreground mb-1 m-0 font-display font-bold">{t("transfers.netBalance")}</p>
          <p className={`tabular-nums text-2xl font-black font-display m-0 ${net >= 0 ? "text-chart-2" : "text-destructive"}`}>
            {net >= 0 ? "+" : ""}
            {formatFee(net)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TransferList
          title={t("transfers.incoming")}
          icon={<Icon name="arrow-down-left" className="w-4 h-4 text-chart-2" />}
          iconBg="bg-chart-2/20"
          transfers={incoming}
        />
        <TransferList
          title={t("transfers.outgoing")}
          icon={<Icon name="arrow-up-right" className="w-4 h-4 text-destructive" />}
          iconBg="bg-destructive/20"
          transfers={outgoing}
        />
      </div>
    </div>
  );
}

function TransferList({
  title,
  icon,
  iconBg,
  transfers,
}: {
  title: string;
  icon: React.ReactNode;
  iconBg: string;
  transfers: TransferRecord[];
}) {
  const { t } = useTranslation();
  return (
    <div className="card-arcade rounded-md overflow-visible">
      <div className="p-4 border-b border-border flex items-center gap-3">
        <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center`}>{icon}</div>
        <h3 className="font-display font-black uppercase text-xl leading-none m-0">{title}</h3>
        <span className="ml-auto text-sm bg-muted px-2 py-1 rounded-full text-muted-foreground">{transfers.length}</span>
      </div>
      <div className="divide-y divide-border">
        {transfers.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground text-sm">{t("transfers.noTransfers")}</div>
        ) : (
          transfers.map((r) => <TransferRow key={r.id} record={r} />)
        )}
      </div>
    </div>
  );
}

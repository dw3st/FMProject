import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import type { TransferRecord } from "@/types/transferTypes";
import { TransferRow } from "@/GameInterface/Transfers/transferShared";

function byDateDesc(a: TransferRecord, b: TransferRecord): number {
  return b.date.localeCompare(a.date);
}

export function WorldTransfers({ records }: { records: TransferRecord[] }) {
  const { t } = useTranslation();
  const sorted = [...records].sort(byDateDesc);

  if (records.length === 0) {
    return (
      <div className="card-arcade rounded-xl p-12 border-glow text-center">
        <p className="text-muted-foreground text-sm m-0">
          {t("transfers.noTransfers")}
        </p>
      </div>
    );
  }

  return (
    <div className="card-arcade rounded-xl border-glow overflow-visible">
      <div className="p-4 border-b border-border flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-sky-500/20 flex items-center justify-center">
          <Globe className="w-4 h-4 text-sky-400" />
        </div>
        <h3 className="font-bold uppercase tracking-wider text-foreground m-0">{t("transfers.worldTransfersCard")}</h3>
        <span className="ml-auto text-xs bg-muted px-2 py-1 rounded-full text-muted-foreground">{sorted.length}</span>
      </div>
      <div className="divide-y divide-border">
        {sorted.map((r) => (
          <TransferRow key={r.id} record={r} />
        ))}
      </div>
    </div>
  );
}

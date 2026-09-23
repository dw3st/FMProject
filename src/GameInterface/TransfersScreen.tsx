import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeadline } from "@/GameInterface/Components/PageHeadline";
import { MyTransfers } from "@/GameInterface/Transfers/MyTransfers";
import { MySellList } from "@/GameInterface/Transfers/MySellList";
import { WorldTransfers } from "@/GameInterface/Transfers/WorldTransfers";
import { loadSession } from "@/GameInterface/gameSession";
import type { TransfersSplitResponse } from "@/types/transferTypes";

export function TransfersScreen() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"my" | "world" | "sell">("my");
  const [club, setClub] = useState<TransfersSplitResponse["club"]>([]);
  const [world, setWorld] = useState<TransfersSplitResponse["world"]>([]);
  const [playerSquadId, setPlayerSquadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const session = loadSession();
    if (!session) {
      setLoading(false);
      return;
    }
    fetch(`/api/saves/${session.saveId}/transfers`)
      .then((r) => r.json())
      .then((data: TransfersSplitResponse) => {
        setClub(data.club ?? []);
        setWorld(data.world ?? []);
        setPlayerSquadId(data.playerSquadId ?? null);
      })
      .catch(() => {
        setClub([]);
        setWorld([]);
        setPlayerSquadId(null);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="flex-1 p-4 lg:p-6 overflow-auto">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeadline
          backHref="/dashboard"
          trailing={
            <div className="flex flex-wrap rounded-xl overflow-hidden border border-border bg-card/50">
              <button
                type="button"
                onClick={() => setActiveTab("my")}
                className={`px-3 sm:px-5 py-2.5 text-xs sm:text-sm font-bold uppercase tracking-wider transition-all cursor-pointer border-0 ${
                  activeTab === "my"
                    ? "bg-primary text-primary-foreground glow-primary-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50 bg-transparent"
                }`}
              >
                {t("transfers.myTransfers")}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("world")}
                className={`px-3 sm:px-5 py-2.5 text-xs sm:text-sm font-bold uppercase tracking-wider transition-all cursor-pointer border-0 ${
                  activeTab === "world"
                    ? "bg-primary text-primary-foreground glow-primary-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50 bg-transparent"
                }`}
              >
                <span className="hidden sm:inline">{t("transfers.worldTransfers")}</span>
                <span className="sm:hidden">{t("transfers.worldTransfersCard")}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("sell")}
                className={`px-3 sm:px-5 py-2.5 text-xs sm:text-sm font-bold uppercase tracking-wider transition-all cursor-pointer border-0 ${
                  activeTab === "sell"
                    ? "bg-primary text-primary-foreground glow-primary-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50 bg-transparent"
                }`}
              >
                {t("transfers.forSale")}
              </button>
            </div>
          }
        >
          {t("transfers.title")} <span className="text-primary glow-text">{t("common.market")}</span>
        </PageHeadline>

        {loading && activeTab !== "sell" ? (
          <div className="card-arcade rounded-xl p-12 text-center">
            <p className="text-muted-foreground text-sm m-0">{t("transfers.loadingTransfers")}</p>
          </div>
        ) : activeTab === "my" ? (
          <MyTransfers records={club} playerSquadId={playerSquadId} />
        ) : activeTab === "world" ? (
          <WorldTransfers records={world} />
        ) : (
          <MySellList />
        )}
      </div>
    </main>
  );
}

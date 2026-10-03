import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeadline } from "@/GameInterface/Components/PageHeadline";
import { ScreenContainer } from "@/GameInterface/ui/ScreenContainer";
import { SegmentedTabs } from "@/GameInterface/ui/SegmentedTabs";
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
    <ScreenContainer>
        <PageHeadline
          backHref="/dashboard"
          accent={t("screenTitles.transfers.accent")}
          trailing={
            <SegmentedTabs
              wrap
              tabs={[
                { key: "my", label: t("transfers.myTransfers") },
                {
                  key: "world",
                  label: (
                    <>
                      <span className="hidden sm:inline">{t("transfers.worldTransfers")}</span>
                      <span className="sm:hidden">{t("transfers.worldTransfersCard")}</span>
                    </>
                  ),
                },
                { key: "sell", label: t("transfers.forSale") },
              ]}
              active={activeTab}
              onChange={setActiveTab}
            />
          }
        >
          {t("screenTitles.transfers.main")}
        </PageHeadline>

        {loading && activeTab !== "sell" ? (
          <div className="card-arcade rounded-md p-12 text-center">
            <p className="text-muted-foreground text-sm m-0">{t("transfers.loadingTransfers")}</p>
          </div>
        ) : activeTab === "my" ? (
          <MyTransfers records={club} playerSquadId={playerSquadId} />
        ) : activeTab === "world" ? (
          <WorldTransfers records={world} />
        ) : (
          <MySellList />
        )}
    </ScreenContainer>
  );
}

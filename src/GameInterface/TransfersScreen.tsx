import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScreenTitle } from "@/GameInterface/ui/ScreenTitle";
import { ScreenContainer } from "@/GameInterface/ui/ScreenContainer";
import { SegmentedTabs } from "@/GameInterface/ui/SegmentedTabs";
import { MyTransfers } from "@/GameInterface/Transfers/MyTransfers";
import { MySellList } from "@/GameInterface/Transfers/MySellList";
import { WorldTransfers } from "@/GameInterface/Transfers/WorldTransfers";
import { NegotiationOverview } from "@/GameInterface/Negotiation/NegotiationOverview";
import { loadSession } from "@/GameInterface/gameSession";
import type { TransfersSplitResponse } from "@/types/transferTypes";
import { StaffPoolTab } from "@/GameInterface/Transfers/StaffPoolTab";
import { useTransferWindows, WindowBanner, WindowsTable } from "@/GameInterface/Transfers/transferWindow";

const TABS = ["my", "world", "sell", "loans", "windows", "staff"] as const;
type TransfersTab = (typeof TABS)[number];

export function TransfersScreen() {
  const { t } = useTranslation();
  // `?tab=staff` (and `&role=`) opens the staff pool, e.g. from the staff screen or the scouting centre.
  const [activeTab, setActiveTab] = useState<TransfersTab>(() => {
    const tab = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("tab") : null;
    return TABS.includes(tab as TransfersTab) ? (tab as TransfersTab) : "my";
  });
  const windows = useTransferWindows();
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
        <ScreenTitle
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
                { key: "loans", label: t("negotiation.overview.tab") },
                { key: "windows", label: t("transferWindows.tab") },
                { key: "staff", label: t("transfers.staffTab") },
              ]}
              active={activeTab}
              onChange={setActiveTab}
            />
          }
        >
          {t("screenTitles.transfers.main")}
        </ScreenTitle>

        {activeTab !== "staff" && <WindowBanner data={windows} />}

        {activeTab === "staff" ? (
          loadSession() ? <StaffPoolTab saveId={loadSession()!.saveId} /> : null
        ) : activeTab === "windows" ? (
          <WindowsTable data={windows} />
        ) : activeTab === "loans" ? (
          loadSession() ? <NegotiationOverview saveId={loadSession()!.saveId} sections={["bids", "rivals", "preContracts", "out", "in", "sellOn"]} /> : null
        ) : loading && activeTab !== "sell" ? (
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

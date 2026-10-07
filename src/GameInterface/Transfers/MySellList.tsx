import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { loadSession } from "@/GameInterface/gameSession";
import type { SellCandidate } from "@/types/transferMarketTypes";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import { positionLabel, positionLabelColor } from "@/GameInterface/positionHelpers";
import { preferredRole } from "@/Domain/positions/positionAptitude";
import { Icon } from "@/GameInterface/Icons";
import { AskingPriceModal } from "@/GameInterface/Negotiation/AskingPriceModal";
import { playerMarketValue } from "@/Domain/negotiation/askingPrice";
import { formatFee } from "@/Domain/money";

export function MySellList() {
  const { t } = useTranslation();
  const session = loadSession();
  const saveId = session?.saveId;
  const leagueSlug = session?.leagueSlug;
  const clubId = session?.clubId;

  const [candidates, setCandidates] = useState<SellCandidate[]>([]);
  const [squad, setSquad] = useState<Squad | null>(null);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pricingId, setPricingId] = useState<string | null>(null);

  /** Primitives only — `loadSession()` returns a new object every render, so never depend on `session`. */
  const load = useCallback(async () => {
    if (!saveId || !leagueSlug || !clubId) {
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const [listRes, squadRes] = await Promise.all([
        fetch(`/api/saves/${saveId}/sell-list`),
        fetch(`/api/saves/${saveId}/squad/${leagueSlug}/${clubId}`),
      ]);
      if (!listRes.ok) throw new Error("Could not load sell list");
      if (!squadRes.ok) throw new Error("Could not load squad");
      const list = (await listRes.json()) as SellCandidate[];
      const sq = (await squadRes.json()) as Squad;
      setCandidates(list);
      setSquad(sq);
    } catch {
      setError(t("transfers.mySellList.loadingError"));
    } finally {
      setLoading(false);
    }
  }, [saveId, leagueSlug, clubId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function removeFromList(playerId: string) {
    if (!saveId || removingId) return;
    setRemovingId(playerId);
    setError(null);
    try {
      const res = await fetch(`/api/saves/${saveId}/sell-list`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
      if (!res.ok) throw new Error("Remove failed");
      const { playerSellList } = (await res.json()) as { playerSellList: SellCandidate[] };
      setCandidates(playerSellList);
    } catch {
      setError(t("transfers.mySellList.updateError"));
    } finally {
      setRemovingId(null);
    }
  }

  if (!session) {
    return (
      <div className="card-arcade rounded-md p-12 text-center">
        <p className="text-muted-foreground text-sm m-0">{t("transfers.mySellList.noSaveLoaded")}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="card-arcade rounded-md p-12 text-center flex flex-col items-center gap-3">
        <Icon name="loader2" className="w-8 h-8 text-primary animate-spin" aria-hidden />
        <p className="text-muted-foreground text-sm m-0">{t("transfers.mySellList.loading")}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card-arcade rounded-md p-8 border-destructive/40 text-center space-y-3">
        <p className="text-destructive text-sm m-0">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="text-sm font-bold text-primary hover:underline cursor-pointer"
        >
          {t("transfers.mySellList.retry")}
        </button>
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <div className="card-arcade rounded-md p-12 text-center space-y-2">
        <Icon name="tag" className="w-10 h-10 mx-auto text-muted-foreground opacity-50" aria-hidden />
        <p className="text-muted-foreground text-sm m-0 max-w-md mx-auto">
          {t("transfers.mySellList.instructions.part1")}{" "}
          <strong className="text-foreground">{t("transfers.mySellList.instructions.listForSale")}</strong> {t("transfers.mySellList.instructions.part2")}
        </p>
      </div>
    );
  }

  const byId = new Map<string, RosterPlayer>();
  (squad?.players ?? []).forEach((p) => byId.set(p.id, p));

  const playerHref = (playerId: string) =>
    `/player/${encodeURIComponent(leagueSlug!)}/${encodeURIComponent(clubId!)}/${encodeURIComponent(playerId)}`;

  return (
    <div className="card-arcade rounded-md overflow-hidden">
      <div className="p-4 border-b border-border flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
          <Icon name="tag" className="w-4 h-4 text-primary" />
        </div>
        <h3 className="font-display font-black uppercase text-xl leading-none m-0">{t("transfers.mySellList.listedForSale")}</h3>
        <span className="ml-auto text-sm bg-muted px-2 py-1 rounded-full text-muted-foreground">{candidates.length}</span>
      </div>
      <ul className="divide-y divide-border m-0 p-0 list-none">
        {candidates.map((c) => {
          const p = byId.get(c.playerId);
          const name = p?.name ?? `Player ${c.playerId.slice(0, 8)}…`;
          const pos = p?.positions?.[0] ?? "—";
          const natural = p?.stats ? preferredRole(p) : undefined;
          const busy = removingId === c.playerId;

          return (
            <li key={c.playerId} className="p-4 hover:bg-muted/30 transition-colors flex items-center gap-4">
              <div
                className={`px-2 py-1 rounded text-sm font-black shrink-0 w-10 text-center ${positionLabelColor(natural, pos)}`}
              >
                {positionLabel(t, natural, pos)}
              </div>
              <div className="flex-1 min-w-0">
                <a
                  href={playerHref(c.playerId)}
                  className="font-bold text-foreground hover:text-primary hover:underline no-underline"
                >
                  {name}
                </a>
                <p className="text-sm text-muted-foreground m-0 mt-0.5 tabular-nums">
                  {p
                    ? t("transfers.mySellList.asking", {
                      price: formatFee(c.askingPrice ?? playerMarketValue(p)),
                      pct: Math.round(((c.askingPrice ?? playerMarketValue(p)) / playerMarketValue(p)) * 100),
                    })
                    : `${t("transfers.mySellList.sellingPriority")} ${Math.round(c.priority * 100)}%`}
                </p>
              </div>
              {p && (
                <button
                  type="button"
                  onClick={() => setPricingId(c.playerId)}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border border-border bg-muted/50 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  title={t("negotiation.asking.title")}
                >
                  <Icon name="pencil" className="w-4 h-4" aria-hidden />
                  <span className="hidden sm:inline">{t("negotiation.asking.edit")}</span>
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => void removeFromList(c.playerId)}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border border-border bg-muted/50 text-muted-foreground hover:text-destructive hover:border-destructive/50 hover:bg-destructive/10 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title={t("common.removeFromSaleList")}
              >
                {busy ? (
                  <Icon name="loader2" className="w-4 h-4 animate-spin" aria-hidden />
                ) : (
                  <Icon name="trash2" className="w-4 h-4" aria-hidden />
                )}
                <span className="hidden sm:inline">{t("common.remove")}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {pricingId && saveId && byId.get(pricingId) && (() => {
        const p = byId.get(pricingId)!;
        const current = candidates.find((c) => c.playerId === pricingId)?.askingPrice;
        return (
          <AskingPriceModal
            saveId={saveId}
            playerId={p.id}
            playerName={p.name}
            value={playerMarketValue(p)}
            {...(current !== undefined ? { current } : {})}
            listed
            onClose={() => setPricingId(null)}
            onSaved={setCandidates}
          />
        );
      })()}
    </div>
  );
}

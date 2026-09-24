import { randomUUID } from "crypto";
import { saveService } from "@/backend/SaveService";
import { executeTransferFee } from "@/backend/FinancialService";
import { isPlayerSquadId } from "@/Domain/clubLookup";
import type { TransferRecord, TransfersSplitResponse } from "@/types/transferTypes";
import type { TransferRef } from "@/types/dayLogTypes";
import type { SellCandidate } from "@/types/transferMarketTypes";
import { collectSellListedIds } from "@/Domain/scout/scoutQuery";
import {
  evaluateTransferOffer,
  squadsAfterAcceptedTransfer,
} from "@/Domain/transfer/transferAcceptance";
import { getSellPriority } from "@/Domain/transfer/sellList";
import { initMarketState } from "@/Domain/transfer/marketRotation";
import { requireSaveOwner } from "@/backend/auth/middleware";

function splitTransfersByClub(
  transfers: TransferRecord[],
  playerSquadId: string | null,
): TransfersSplitResponse {
  if (!playerSquadId) {
    return { club: transfers, world: [], playerSquadId: null };
  }
  const club: TransferRecord[] = [];
  const world: TransferRecord[] = [];
  for (const t of transfers) {
    if (t.fromSquadId === playerSquadId || t.toSquadId === playerSquadId) club.push(t);
    else world.push(t);
  }
  return { club, world, playerSquadId };
}

async function enrichTransfersWithLogos(
  saveId: string,
  transfers: TransferRecord[],
): Promise<TransferRecord[]> {
  const ids = new Set<string>();
  for (const t of transfers) {
    ids.add(t.fromSquadId);
    ids.add(t.toSquadId);
  }
  const resolved = new Map<string, { leagueSlug: string; clubSlug: string }>();
  for (const id of ids) {
    const r = await saveService.resolveSquadId(saveId, id);
    if (r) resolved.set(id, r);
  }
  return transfers.map((t) => {
    const from = resolved.get(t.fromSquadId);
    const to = resolved.get(t.toSquadId);
    return {
      ...t,
      fromLeagueSlug: from?.leagueSlug,
      fromClubSlug: from?.clubSlug,
      toLeagueSlug: to?.leagueSlug,
      toClubSlug: to?.clubSlug,
    };
  });
}

export const transferRoutes = {
  "/api/saves/:saveId/transfers": async (
    req: Request & { params: Record<string, string> },
  ) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;

    if (req.method === "GET") {
      const meta = await saveService.getMeta(saveId);
      if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
      const raw = await saveService.getTransfers(saveId);
      const enriched = await enrichTransfersWithLogos(saveId, raw);
      const playerSquadId = meta.clubId;
      const body: TransfersSplitResponse = splitTransfersByClub(enriched, playerSquadId);
      return Response.json(body);
    }

    if (req.method === "POST") {
      const meta = await saveService.getMeta(saveId);
      if (!meta) return Response.json({ error: "save not found" }, { status: 404 });

      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return Response.json({ error: "invalid body" }, { status: 400 });
      }

      if (!body || typeof body !== "object") {
        return Response.json({ error: "missing or invalid fields" }, { status: 400 });
      }

      const { playerId, fromSquadId, fee } = body as Record<string, unknown>;
      if (typeof playerId !== "string" || playerId.length === 0) {
        return Response.json({ error: "missing or invalid fields" }, { status: 400 });
      }
      if (typeof fromSquadId !== "string" || fromSquadId.length === 0) {
        return Response.json({ error: "missing or invalid fields" }, { status: 400 });
      }
      if (typeof fee !== "number" || !Number.isFinite(fee) || fee <= 0) {
        return Response.json({ error: "missing or invalid fields" }, { status: 400 });
      }

      // ── Resolve squads ────────────────────────────────────────────────────
      const buyerResolved = { leagueSlug: meta.leagueSlug, clubSlug: meta.clubId };
      const sellerResolved = await saveService.resolveSquadId(saveId, fromSquadId);
      if (!sellerResolved) return Response.json({ error: "selling squad not found" }, { status: 404 });

      const [sellerSquad, buyerSquad] = await Promise.all([
        saveService.getSquad(saveId, sellerResolved.leagueSlug, sellerResolved.clubSlug),
        saveService.getSquad(saveId, buyerResolved.leagueSlug, buyerResolved.clubSlug),
      ]);
      if (!sellerSquad) return Response.json({ error: "selling squad not found" }, { status: 404 });
      if (!buyerSquad) return Response.json({ error: "buying squad not found" }, { status: 404 });

      // ── Budget check ──────────────────────────────
      const budget = buyerSquad.finances?.budget ?? 0;
      if (budget < fee) {
        return Response.json({ error: "Insufficient funds" }, { status: 400 });
      }

      const player = sellerSquad.players.find((p) => p.id === playerId);
      if (!player) return Response.json({ error: "player not found" }, { status: 404 });

      // ── Look up seller's sell list for acceptance boost ───────────────────
      const rawMarket = await saveService.getMarket(saveId);
      const market = rawMarket ? { ...rawMarket, playerSellList: rawMarket.playerSellList ?? [] } : null;
      const sellerProfile = market?.profiles[fromSquadId];
      const sellPriority = sellerProfile
        ? (getSellPriority(playerId, sellerProfile.sellList ?? []) ?? undefined)
        : undefined;

      // ── AI acceptance decision ────────────────────────────────────────────
      const { accepted, reason } = evaluateTransferOffer(player, sellerSquad, fee, sellPriority);

      const transferId = randomUUID();
      const date = meta.currentDate ?? new Date().toISOString().slice(0, 10);

      const record: TransferRecord = {
        id: transferId,
        date,
        playerId,
        playerName: player.name,
        playerPosition: player.positions[0] ?? "—",
        playerAge: player.age,
        fromSquadId,
        fromSquadName: sellerSquad.name,
        toSquadId: buyerSquad.id,
        toSquadName: buyerSquad.name,
        fee,
        direction: "in",
        status: accepted ? "accepted" : "rejected",
        reason,
      };

      let updatedMeta = meta;

      if (accepted) {
        // Move player between squads (no money here — FinancialService handles that)
        const { selling, buying } = squadsAfterAcceptedTransfer(
          player,
          sellerSquad,
          buyerSquad,
          buyerSquad.id,
          playerId,
        );

        // Exchange money via FinancialService
        const isSellerPlayerClub = isPlayerSquadId(fromSquadId, meta);
        updatedMeta = await executeTransferFee(
          saveId,
          meta,
          { squad: buying, ...buyerResolved, isPlayerClub: true },
          { squad: selling, ...sellerResolved, isPlayerClub: isSellerPlayerClub },
          fee,
        );

        await Promise.all([
          saveService.saveSquad(saveId, sellerResolved.leagueSlug, sellerResolved.clubSlug, selling),
          saveService.saveSquad(saveId, buyerResolved.leagueSlug, buyerResolved.clubSlug, buying),
        ]);

        // Remove the sold player from the seller's sell list in the market profile
        if (market && sellerProfile) {
          const updatedProfile = {
            ...sellerProfile,
            sellList: (sellerProfile.sellList ?? []).filter((c) => c.playerId !== playerId),
          };
          await saveService.saveMarket(saveId, {
            ...market,
            profiles: { ...market.profiles, [fromSquadId]: updatedProfile },
          });
        }
      }

      await saveService.appendTransfer(saveId, record);
      const ref: TransferRef = { kind: "transfer_ref", transferId };
      await saveService.appendDayEvent(saveId, date, ref);

      const newBudget = buyerSquad.finances?.budget ?? 0;
      return Response.json({ record, newBudget });
    }

    return Response.json({ error: "method not allowed" }, { status: 405 });
  },

  // ── Sell list routes ───────────────────────────────────────────────────────

  "/api/saves/:saveId/sell-list": async (
    req: Request & { params: Record<string, string> },
  ) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    const rawMarket = await saveService.getMarket(saveId);
    const market = rawMarket ? { ...rawMarket, playerSellList: (rawMarket.playerSellList ?? []) as SellCandidate[] } : null;

    if (req.method === "GET") {
      return Response.json(market?.playerSellList ?? []);
    }

    if (req.method === "POST") {
      let body: unknown;
      try { body = await req.json(); } catch {
        return Response.json({ error: "invalid body" }, { status: 400 });
      }
      const { playerId } = body as Record<string, unknown>;
      if (typeof playerId !== "string" || playerId.length === 0) {
        return Response.json({ error: "missing playerId" }, { status: 400 });
      }

      const allSquads = await saveService.getAllSquads(saveId);
      const baseMarket = market ?? initMarketState(allSquads);
      const currentList: SellCandidate[] = baseMarket.playerSellList;

      let newList: SellCandidate[];
      const existingIdx = currentList.findIndex((c) => c.playerId === playerId);
      if (existingIdx >= 0) {
        // Toggle off
        newList = currentList.filter((c) => c.playerId !== playerId);
      } else {
        // Add with max priority (human explicitly listed it)
        newList = [...currentList, { playerId, priority: 1.0 }];
      }

      const updatedMarket = { ...baseMarket, playerSellList: newList };
      await saveService.saveMarket(saveId, updatedMarket);
      return Response.json({ playerSellList: newList });
    }

    return Response.json({ error: "method not allowed" }, { status: 405 });
  },

  "/api/saves/:saveId/sell-listed-players": async (
    req: Request & { params: Record<string, string> },
  ) => {
    if (req.method !== "GET") {
      return Response.json({ error: "method not allowed" }, { status: 405 });
    }

    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    // Same source as the scout search `onlyForSale` filter: every AI sell list + the human one.
    const ids = collectSellListedIds(await saveService.getMarket(saveId));

    return Response.json(ids);
  },
};

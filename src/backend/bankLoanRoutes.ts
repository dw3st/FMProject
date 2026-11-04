import { requireSeat } from "@/backend/auth/middleware";
import { BufferingSaveDAL } from "@/backend/dal/BufferingSaveDAL";
import { FileSystemDAL } from "@/backend/dal/FileSystemDAL";
import { recordMoney } from "@/backend/FinancialService";
import { withSaveLock } from "@/backend/saveLock";
import { SaveService } from "@/backend/SaveService";
import { ledgerSeason } from "@/backend/staffRoutes";
import { applyBankLoan } from "@/Domain/boardFans/boardFans";
import { bankLoanRefusal, newBankLoan } from "@/Domain/finance/bankLoan";

type Req = Request & { params: Record<string, string> };

export const bankLoanRoutes = {
  /** Takes a bank loan: the money and the debt are written together (`.claude/rules/game/finances.md`). */
  "/api/saves/:saveId/bank-loan": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    const body = await req.json().catch(() => null) as { amount?: unknown; seasons?: unknown } | null;
    if (!body) return Response.json({ error: "invalidAmount" }, { status: 400 });
    return withSaveLock(saveId, async () => {
      const buffer = new BufferingSaveDAL(new FileSystemDAL());
      const service = new SaveService(buffer);
      const meta = await service.getSeatMeta(saveId, auth.seatId);
      if (!meta?.clubId || meta.unemployed) return Response.json({ error: "noClub" }, { status: 409 });
      const ref = await service.resolveSquadId(saveId, meta.clubId);
      const squad = ref ? await service.getSquad(saveId, ref.leagueSlug, ref.clubSlug) : null;
      if (!ref || !squad) return Response.json({ error: "noClub" }, { status: 409 });
      const refusal = bankLoanRefusal(squad, meta.board?.board, body.amount, body.seasons);
      if (refusal) return Response.json({ error: refusal }, { status: refusal === "loanActive" || refusal === "boardLow" ? 409 : 400 });
      const amount = body.amount as number;
      const date = meta.currentDate ?? "";
      const bankLoan = newBankLoan(amount, body.seasons as number, date);
      await service.saveSquad(saveId, ref.leagueSlug, ref.clubSlug, { ...squad, bankLoan });
      await recordMoney(service, saveId, await ledgerSeason(service, saveId, ref.leagueSlug, date), ref, {
        date, kind: "loan_in", amount, label: "Bank loan",
      }, auth.seatId);
      if (meta.board) await service.updateSeat(saveId, auth.seatId, { board: applyBankLoan(meta.board) });
      await buffer.flush();
      return Response.json({ loan: bankLoan });
    });
  },
};

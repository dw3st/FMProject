import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatEuros, formatWageShort } from "@/Domain/money";
import { FOUNDED } from "@/Domain/ownClub/ownClubConfig";
import { Button } from "@/GameInterface/ui/Button";
import { Label } from "@/GameInterface/ui/Label";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { TextField } from "@/GameInterface/ui/TextField";
import { depositToClub, fetchPresident, setManagerWage, type PresidentView } from "@/GameInterface/OwnClub/ownClubApi";

type President = Extract<PresidentView, { president: true }>;

/** Whole euros from a typed text ("1.000", "2500"), or null. */
function parseEuros(text: string): number | null {
  const digits = text.replace(/[^\d]/g, "");
  return digits.length > 0 && digits.length <= 12 ? Number.parseInt(digits, 10) : null;
}

/** The president's money (`.claude/rules/game/own-club.md`): put his own money into the club, set his own wage. */
export function PresidentMoneyPanel({ saveId, onChanged }: { saveId: string; onChanged: () => void }) {
  const { t } = useTranslation();
  const [view, setView] = useState<President | null>(null);
  const [amount, setAmount] = useState("");
  const [wage, setWage] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetchPresident(saveId);
    if (r.ok && r.data.president) {
      setView(r.data);
      setWage(String(r.data.wage));
    } else setView(null);
  }, [saveId]);
  useEffect(() => { void load(); }, [load]);

  if (!view) return null;

  const deposit = parseEuros(amount);
  const depositOk = deposit !== null && deposit >= FOUNDED.DEPOSIT_MIN && deposit <= view.wallet;
  const newWage = parseEuros(wage);
  const wageOk = newWage !== null && newWage <= view.wageCap && newWage !== view.wage;
  const fail = (error: string) => setMessage({ ok: false, text: t(`ownClub.errors.${error}`, { defaultValue: t("ownClub.errors.generic") }) });

  const doDeposit = async () => {
    if (!depositOk || deposit === null) return;
    setBusy(true);
    const r = await depositToClub(saveId, deposit);
    setBusy(false);
    if (!r.ok) { fail(r.error); return; }
    setAmount("");
    setView({ ...view, wallet: r.data.wallet });
    setMessage({ ok: true, text: t("ownClub.money.deposited", { amount: formatEuros(deposit) }) });
    onChanged();
  };

  const doWage = async () => {
    if (!wageOk || newWage === null) return;
    setBusy(true);
    const r = await setManagerWage(saveId, newWage);
    setBusy(false);
    if (!r.ok) { fail(r.error); return; }
    setView({ ...view, wage: r.data.wage, wageCap: r.data.wageCap });
    setMessage({ ok: true, text: t("ownClub.money.wageSaved", { wage: formatWageShort(r.data.wage) }) });
    onChanged();
  };

  return (
    <section className="card-arcade rounded-md p-4 flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <SectionTitle>{t("ownClub.money.title")}</SectionTitle>
        <span className="flex items-baseline gap-2">
          <Label>{t("ownClub.money.wallet")}</Label>
          <span className="font-display font-bold text-xl leading-none tabular-nums text-star-green">{formatEuros(view.wallet)}</span>
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-end gap-3">
            <TextField
              id="president-deposit"
              className="flex-1"
              variant="box"
              inputMode="numeric"
              label={t("ownClub.money.deposit")}
              value={amount}
              placeholder={formatEuros(FOUNDED.DEPOSIT_MIN)}
              onChange={(e) => { setAmount(e.target.value); setMessage(null); }}
            />
            <Button disabled={busy || !depositOk} onClick={() => void doDeposit()}>{t("ownClub.money.depositButton")}</Button>
          </div>
          <p className="text-sm text-muted-foreground m-0 tabular-nums">{t("ownClub.money.depositHint", { min: formatEuros(FOUNDED.DEPOSIT_MIN) })}</p>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-end gap-3">
            <TextField
              id="president-wage"
              className="flex-1"
              variant="box"
              inputMode="numeric"
              label={t("ownClub.money.wage")}
              value={wage}
              onChange={(e) => { setWage(e.target.value); setMessage(null); }}
            />
            <Button disabled={busy || !wageOk} onClick={() => void doWage()}>{t("ownClub.money.wageButton")}</Button>
          </div>
          <p className="text-sm text-muted-foreground m-0 tabular-nums">
            {t("ownClub.money.wageHint", { wage: formatWageShort(view.wage), cap: formatWageShort(view.wageCap) })}
          </p>
        </div>
      </div>
      {message && <p className={`text-sm m-0 ${message.ok ? "text-foreground" : "text-destructive"}`}>{message.text}</p>}
    </section>
  );
}

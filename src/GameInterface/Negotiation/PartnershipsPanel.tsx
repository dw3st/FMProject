import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/GameInterface/ui/Button";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { SelectCombobox } from "@/GameInterface/Components/SelectCombobox";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { Icon } from "@/GameInterface/Icons";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { attrDisplay } from "@/Domain/attributes";
import { overallAvg } from "@/Domain/playerRating";
import type { PartnershipKind, SeatPartnerships } from "@/types/partnershipTypes";

const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground";

interface Candidate { clubId: string; name: string; leagueSlug: string; division: number; tier: string; refusal: string | null }
interface Lent { playerId: string; name: string; until: string; wageShare: number; apps: number; overall: number | null }
interface FromParent { playerId: string; name: string; until: string; wageShare: number }
interface View {
  partnerships: SeatPartnerships;
  lent: Lent[];
  fromParent: FromParent[];
  maxLoans: number;
  candidates: Record<PartnershipKind, Candidate[]>;
}

const SHARES = ["0", "25", "50"] as const;

/**
 * Club partnerships (report 648035a3, `.claude/rules/game/partnerships.md`): a satellite below the club takes young
 * players on loan, a parent above it offers its own. From `GET /api/saves/:id/partnerships`.
 */
export function PartnershipsPanel({ saveId }: { saveId: string }) {
  const { t } = useTranslation();
  const { refresh } = useGameSave();
  const [view, setView] = useState<View | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void fetch(`/api/saves/${saveId}/partnerships`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load"))))
      .then((v: View) => { if (alive) setView(v); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [saveId, tick]);

  const errorText = (code: string | undefined) =>
    t(`partnerships.errors.${code ?? "generic"}`, { defaultValue: t("partnerships.errors.generic") });

  async function send(path: string, method: string, body?: unknown): Promise<boolean> {
    setNote(null);
    const res = await fetch(`/api/saves/${saveId}${path}`, {
      method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const out = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) { setNote(errorText(out.error)); return false; }
    setTick((n) => n + 1);
    void refresh();
    return true;
  }

  if (failed) return null;
  if (!view) return null;
  return (
    <section className="card-arcade rounded-md">
      <div className="p-4 border-b border-border flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
          <Icon name="handshake" className="w-4 h-4 text-primary" />
        </div>
        <h3 className="font-display font-black uppercase text-xl leading-none m-0">{t("partnerships.title")}</h3>
      </div>
      {note && <p className="px-4 pt-3 text-sm font-semibold text-destructive m-0" role="status">{note}</p>}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-4">
        <SatelliteSide view={view} send={send} />
        <ParentSide view={view} send={send} />
      </div>
    </section>
  );
}

type Send = (path: string, method: string, body?: unknown) => Promise<boolean>;

function PartnerHeader({ kind, view, send }: { kind: PartnershipKind; view: View; send: Send }) {
  const { t, i18n } = useTranslation();
  const partner = view.partnerships[kind];
  const [pick, setPick] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const fmt = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(i18n.language, { day: "numeric", month: "short", year: "numeric" });
  if (partner) {
    return (
      <div className="flex items-center gap-3">
        <ClubLogo logoUrl={squadLogoUrl(partner.clubId)} className="w-8 h-8" title={partner.clubName} />
        <div className="min-w-0">
          <div className="font-semibold text-foreground truncate">{partner.clubName}</div>
          <div className="text-sm text-muted-foreground">{t("partnerships.since", { date: fmt(partner.since) })}</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {confirm ? (
            <>
              <Button variant="danger" disabled={busy} onClick={async () => { setBusy(true); await send(`/partnerships/${kind}`, "DELETE"); setBusy(false); setConfirm(false); }}>
                {t("partnerships.endConfirm")}
              </Button>
              <Button variant="secondary" onClick={() => setConfirm(false)}>{t("common.cancel")}</Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => setConfirm(true)}>{t("partnerships.end")}</Button>
          )}
        </div>
      </div>
    );
  }
  const options = view.candidates[kind].map((c) => ({
    value: c.clubId,
    label: c.refusal ? `${c.name} · ${t(`partnerships.refusal.${c.refusal}`)}` : c.name,
    group: t("partnerships.division", { n: c.division }),
    disabled: c.refusal !== null,
  }));
  const open = view.candidates[kind].some((c) => c.refusal === null);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground m-0">{t(`partnerships.${kind}.none`)}</p>
      {open ? (
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
            <SelectCombobox label={t("partnerships.club")} value={pick} onChange={setPick} options={options} placeholder={t("partnerships.pickClub")} />
          </div>
          <Button disabled={!pick || busy} onClick={async () => { setBusy(true); await send("/partnerships", "POST", { kind, clubId: pick }); setBusy(false); }}>
            {t("partnerships.propose")}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground m-0">{t(`partnerships.${kind}.noCandidate`)}</p>
      )}
    </div>
  );
}

function SatelliteSide({ view, send }: { view: View; send: Send }) {
  const { t, i18n } = useTranslation();
  const { squad } = useGameSave();
  const [player, setPlayer] = useState("");
  const [share, setShare] = useState<(typeof SHARES)[number]>("25");
  const [busy, setBusy] = useState(false);
  const fmt = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(i18n.language, { day: "numeric", month: "short", year: "numeric" });
  const sat = view.partnerships.satellite;
  const own = (squad?.players ?? []).filter((p) => !p.loan && !p.deferredTo)
    .sort((a, b) => a.age - b.age || overallAvg(b) - overallAvg(a))
    .map((p) => ({ value: p.id, label: `${p.name} · ${p.age} · ${attrDisplay(overallAvg(p))}` }));
  return (
    <div className="space-y-4">
      <div className={LABEL}>{t("partnerships.satellite.title")}</div>
      <PartnerHeader kind="satellite" view={view} send={send} />
      {sat && (
        <>
          <p className="text-sm text-muted-foreground m-0">{t("partnerships.satellite.rule", { max: view.maxLoans })}</p>
          {view.lent.length > 0 && (
            <ul className="m-0 p-0 list-none divide-y divide-border/50 tabular-nums">
              {view.lent.map((l) => (
                <li key={l.playerId} className="py-2 flex items-center gap-3 text-sm">
                  <span className="font-semibold text-foreground flex-1 truncate">{l.name}</span>
                  {l.overall !== null && <span className="text-muted-foreground">{attrDisplay(l.overall)}</span>}
                  <span className="text-muted-foreground">{t("partnerships.apps", { n: l.apps })}</span>
                  <span className="text-muted-foreground">{t("partnerships.until", { date: fmt(l.until) })}</span>
                </li>
              ))}
            </ul>
          )}
          {view.lent.length < view.maxLoans ? (
            <div className="space-y-3">
              <SelectCombobox label={t("partnerships.satellite.lend")} value={player} onChange={setPlayer} options={own} placeholder={t("partnerships.pickPlayer")} />
              <div>
                <div className={`${LABEL} mb-1.5`}>{t("partnerships.satellite.share")}</div>
                <OptionChips options={SHARES.map((s) => ({ key: s, label: `${s}%` }))} value={share} onChange={setShare} />
              </div>
              <Button disabled={!player || busy} onClick={async () => {
                setBusy(true);
                if (await send("/partnerships/satellite/loan", "POST", { playerId: player, wageShare: Number(share) })) setPlayer("");
                setBusy(false);
              }}>
                {t("partnerships.satellite.send")}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground m-0">{t("partnerships.satellite.full", { max: view.maxLoans })}</p>
          )}
        </>
      )}
    </div>
  );
}

function ParentSide({ view, send }: { view: View; send: Send }) {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(false);
  const fmt = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(i18n.language, { day: "numeric", month: "short", year: "numeric" });
  const parent = view.partnerships.parent;
  const offer = parent?.pending;
  return (
    <div className="space-y-4">
      <div className={LABEL}>{t("partnerships.parent.title")}</div>
      <PartnerHeader kind="parent" view={view} send={send} />
      {parent && (
        <>
          <p className="text-sm text-muted-foreground m-0">{t("partnerships.parent.rule")}</p>
          {offer && <ParentOfferBox offer={offer} busy={busy} onAnswer={async (accept) => {
            setBusy(true);
            await send("/partnerships/parent/offer", "POST", { accept });
            setBusy(false);
          }} />}
          {view.fromParent.length > 0 && (
            <ul className="m-0 p-0 list-none divide-y divide-border/50 tabular-nums">
              {view.fromParent.map((l) => (
                <li key={l.playerId} className="py-2 flex items-center gap-3 text-sm">
                  <span className="font-semibold text-foreground flex-1 truncate">{l.name}</span>
                  <span className="text-muted-foreground">{t("partnerships.youPay", { share: Math.round(l.wageShare * 100) })}</span>
                  <span className="text-muted-foreground">{t("partnerships.until", { date: fmt(l.until) })}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** The parent's loan offer, also shown in the inbox. */
export function ParentOfferBox({ offer, busy, onAnswer }: {
  offer: NonNullable<NonNullable<SeatPartnerships["parent"]>["pending"]>; busy: boolean; onAnswer: (accept: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const fmt = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(i18n.language, { day: "numeric", month: "long", year: "numeric" });
  return (
    <div className="rounded-md border border-border p-4 space-y-3">
      <div className="font-semibold text-foreground">{t("partnerships.parent.offer", { player: offer.playerName })}</div>
      <div className="grid grid-cols-2 gap-3 tabular-nums">
        <div>
          <div className={LABEL}>{t("negotiation.loanRenewal.until")}</div>
          <div className="text-sm font-semibold">{fmt(offer.until)}</div>
        </div>
        <div>
          <div className={LABEL}>{t("negotiation.overview.youPay")}</div>
          <div className="text-sm font-semibold">{Math.round(offer.wageShare * 100)}%</div>
        </div>
      </div>
      <p className="text-sm text-muted-foreground m-0">{t("negotiation.loanRenewal.deadline", { date: fmt(offer.expires) })}</p>
      <div className="flex gap-2">
        <Button disabled={busy} onClick={() => onAnswer(true)}>{t("negotiation.loanRenewal.accept")}</Button>
        <Button variant="secondary" disabled={busy} onClick={() => onAnswer(false)}>{t("negotiation.loanRenewal.reject")}</Button>
      </div>
    </div>
  );
}

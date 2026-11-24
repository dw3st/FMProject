import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { addDays } from "@/Domain/dates";
import { formatEuros } from "@/Domain/money";
import { positionIndex } from "@/Domain/positions/positionSort";
import { preferredRole } from "@/Domain/positions/positionAptitude";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { positionLabel, positionLabelColor } from "@/GameInterface/positionHelpers";
import { Button } from "@/GameInterface/ui/Button";
import { DataTable, type DataTableColumn } from "@/GameInterface/ui/DataTable";
import { Notice } from "@/GameInterface/ui/Notice";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { TickBox } from "@/GameInterface/ui/TickBox";
import type { TrialAge, TrialPlayerView, TrialSize, YouthTrialsView } from "@/types/youthTrialTypes";

const AGES: TrialAge[] = [15, 16, 17];
const SIZES: TrialSize[] = ["small", "medium", "large"];
const LEADS = [14, 21, 28] as const;
type Lead = (typeof LEADS)[number];
const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground";

/** Youth trials (report 107866d4): schedule one, then sign the youngsters worth it into the academy. */
export function YouthTrialsPanel({ onSigned }: { onSigned?: () => void }) {
  const { t, i18n } = useTranslation();
  const { session } = useGameSave();
  const saveId = session?.saveId;
  const [view, setView] = useState<YouthTrialsView | null>(null);
  const [age, setAge] = useState<TrialAge>(16);
  const [size, setSize] = useState<TrialSize>("medium");
  const [lead, setLead] = useState<Lead>(14);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(i18n.language, { day: "2-digit", month: "2-digit", year: "numeric" });

  const load = useCallback(async () => {
    if (!saveId) return;
    const res = await fetch(`/api/saves/${saveId}/youth/trials`);
    if (res.ok) setView(await res.json() as YouthTrialsView);
  }, [saveId]);
  useEffect(() => { void load(); }, [load]);

  async function send(url: string, method: string, body?: unknown): Promise<unknown | null> {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      const json = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) {
        setError(t(`youthTrials.errors.${json.error ?? "generic"}`, { defaultValue: t("youthTrials.errors.generic") }));
        return null;
      }
      return json;
    } finally {
      setBusy(false);
    }
  }

  if (!saveId || !view) return null;
  const base = `/api/saves/${saveId}/youth/trials`;
  const date = addDays(view.window.from, lead - LEADS[0]);

  async function schedule() {
    const out = await send(base, "POST", { age, size, date }) as YouthTrialsView | null;
    if (out) setView(out);
  }
  async function cancel() {
    if (!view?.scheduled) return;
    const out = await send(`${base}/${view.scheduled.id}`, "DELETE") as YouthTrialsView | null;
    if (out) setView(out);
  }
  async function sign() {
    const out = await send(`${base}/sign`, "POST", { ids: [...picked] }) as { signed: string[]; youthFull: string[]; view: YouthTrialsView } | null;
    if (!out) return;
    setView(out.view);
    setPicked(new Set());
    setNote(out.youthFull.length > 0
      ? t("youthTrials.signedFull", { count: out.signed.length, left: out.youthFull.length })
      : t("youthTrials.signed", { count: out.signed.length }));
    onSigned?.();
  }

  const range = (r: [number, number]) => `${r[0].toFixed(1)} – ${r[1].toFixed(1)}`;
  const columns: DataTableColumn<TrialPlayerView>[] = [
    {
      key: "pick",
      header: "",
      cell: (r) => (
        <TickBox
          checked={picked.has(r.player.id)}
          label={r.player.name}
          onChange={(on) => setPicked((s) => {
            const n = new Set(s);
            if (on) n.add(r.player.id); else n.delete(r.player.id);
            return n;
          })}
        />
      ),
    },
    {
      key: "pos",
      header: t("youth.position"),
      sortValue: (r) => positionIndex(preferredRole(r.player)),
      cell: (r) => (
        <span className={`font-display font-bold ${positionLabelColor(preferredRole(r.player), r.player.positions[0] ?? "CM")}`}>
          {positionLabel(t, preferredRole(r.player), r.player.positions[0] ?? "CM")}
        </span>
      ),
    },
    {
      key: "name",
      header: t("youth.player"),
      sortValue: (r) => r.player.name,
      cell: (r) => (
        <span className="inline-flex items-center gap-2">
          <span className="font-semibold text-foreground">{r.player.name}</span>
          {r.gem && <span className="rounded border border-chart-4/60 bg-chart-4/15 px-2 py-0.5 text-sm text-chart-4">{t("youthTrials.gem")}</span>}
        </span>
      ),
    },
    { key: "age", header: t("youth.age"), sortValue: (r) => r.player.age, cell: (r) => <span className="tabular-nums">{r.player.age}</span> },
    {
      key: "level",
      header: t("youth.level"),
      sortValue: (r) => r.overall[1],
      cell: (r) => <span className="font-display font-bold tabular-nums">{range(r.overall)}</span>,
    },
    {
      key: "potential",
      header: t("youth.potential"),
      sortValue: (r) => r.potential[1],
      cell: (r) => <span className="tabular-nums text-muted-foreground">{range(r.potential)}</span>,
    },
  ];

  return (
    <section className="flex flex-col gap-3">
      <SectionTitle>{t("youthTrials.title")}</SectionTitle>
      <p className="text-sm text-muted-foreground m-0">
        {t("youthTrials.subtitle", { left: view.left, per: view.perSeason })}
        {view.reveals.count > 0 && ` ${t("youthTrials.reveals", { count: view.reveals.count })}`}
      </p>
      {error && <Notice kind="error">{error}</Notice>}
      {note && <Notice>{note}</Notice>}

      {view.scheduled ? (
        <div className="flex flex-wrap items-center gap-4 rounded-md border border-border px-3 py-2">
          <span className="text-sm text-foreground">
            {t("youthTrials.scheduled", { date: day(view.scheduled.date), age: view.scheduled.age, count: view.counts[view.scheduled.size] })}
          </span>
          <span className="flex-1" />
          <Button variant="secondary" disabled={busy} onClick={() => void cancel()}>{t("youthTrials.cancel")}</Button>
        </div>
      ) : view.left > 0 ? (
        <div className="flex flex-wrap items-end gap-6">
          <div className="flex flex-col gap-1.5">
            <span className={LABEL}>{t("youthTrials.age")}</span>
            <OptionChips<string>
              aria-label={t("youthTrials.age")}
              value={String(age)}
              onChange={(v) => setAge(Number(v) as TrialAge)}
              options={AGES.map((a) => ({ key: String(a), label: t("youthTrials.ageOption", { age: a }) }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={LABEL}>{t("youthTrials.size")}</span>
            <OptionChips<TrialSize>
              aria-label={t("youthTrials.size")}
              value={size}
              onChange={setSize}
              options={SIZES.map((s) => ({ key: s, label: t(`youthTrials.sizes.${s}`, { count: view.counts[s] }) }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={LABEL}>{t("youthTrials.when")}</span>
            <OptionChips<string>
              aria-label={t("youthTrials.when")}
              value={String(lead)}
              onChange={(v) => setLead(Number(v) as Lead)}
              options={LEADS.map((d) => ({ key: String(d), label: t("youthTrials.inDays", { count: d }) }))}
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground tabular-nums">{t("youthTrials.cost", { cost: formatEuros(view.costs[size]), date: day(date) })}</span>
            <Button disabled={busy} onClick={() => void schedule()}>{t("youthTrials.schedule")}</Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground m-0">{t("youthTrials.noneLeft")}</p>
      )}

      {view.results && view.results.players.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-foreground">
              {t("youthTrials.results", { date: day(view.results.date), expires: day(view.results.expires), count: view.results.players.length })}
            </span>
            <span className="flex-1" />
            <span className="text-sm text-muted-foreground tabular-nums">{t("youthTrials.academy", { size: view.academy.size, max: view.academy.max })}</span>
            <Button disabled={busy || picked.size === 0} onClick={() => void sign()}>{t("youthTrials.sign", { count: picked.size })}</Button>
          </div>
          <p className="text-sm text-muted-foreground m-0">{t("youthTrials.blurNote")}</p>
          <DataTable columns={columns} rows={view.results.players} rowKey={(r) => r.player.id} />
        </div>
      )}
    </section>
  );
}

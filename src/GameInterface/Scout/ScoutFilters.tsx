import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SelectListbox, formSelectBoxClass } from "@/GameInterface/Components/SelectListbox";
import { SelectCombobox } from "@/GameInterface/Components/SelectCombobox";
import { ScoutAttributeFiltersDisclosure } from "@/GameInterface/Scout/ScoutAttributeFiltersDisclosure";
import { StepperField } from "@/GameInterface/ui/StepperField";
import {
  createDefaultScoutFilters,
  parsePriceM,
  PRICE_FILTER_NO_LIMIT_M,
  stepPriceM,
  type ScoutFilterState,
} from "@/Domain/scout/scoutFilterState";
import { Icon } from "@/GameInterface/Icons";
import { Chip } from "@/GameInterface/ui/Chip";
import { Button } from "@/GameInterface/ui/Button";
import { SavedScoutFilters } from "@/GameInterface/Scout/SavedScoutFilters";
import type { SavedScoutFilter } from "@/Domain/scout/savedFilters";
import type { ScoutGrade } from "@/types/scoutingTypes";

const SCOUT_GRADES: readonly ScoutGrade[] = ["A", "B", "C", "D", "E"];

export type { ScoutFilterState };

export type ScoutFilterOption = { value: string; label: string };

/**
 * Filter values: a main role (every player of the line), or a detailed role under it (the player's natural position,
 * tester report 4.41.27: full-backs apart from centre-backs, wingers apart from strikers).
 */
const POSITION_FILTERS: { value: string; detailed: boolean }[] = [
  { value: "all", detailed: false }, { value: "GK", detailed: false },
  { value: "Defender", detailed: false },
  ...["CB", "LB", "RB", "LWB", "RWB"].map((value) => ({ value, detailed: true })),
  { value: "Midfielder", detailed: false },
  ...["CDM", "CM", "CAM", "LM", "RM"].map((value) => ({ value, detailed: true })),
  { value: "Forward", detailed: false },
  ...["LW", "RW", "ST"].map((value) => ({ value, detailed: true })),
];

const inputClass = formSelectBoxClass;

const intStep = (v: number, dir: 1 | -1) => Math.round(v) + dir;
const potStep = (v: number, dir: 1 | -1) => (dir > 0 ? Math.floor(v / 5) * 5 + 5 : Math.ceil(v / 5) * 5 - 5);
const oneDecimal = (v: number) => String(Math.round(v * 10) / 10);
/** The top of the price filter: "1000+" means no upper limit. */
const priceMax = (v: number) => (v >= PRICE_FILTER_NO_LIMIT_M ? `${PRICE_FILTER_NO_LIMIT_M}+` : oneDecimal(v));

export function ScoutFilters({
  filters,
  setFilters,
  leagueOptions,
  nationalityOptions,
  onSearch,
  dirty,
  saved,
  onSave,
  onLoadSaved,
  onRemoveSaved,
}: {
  filters: ScoutFilterState;
  setFilters: (f: ScoutFilterState) => void;
  leagueOptions: ScoutFilterOption[];
  nationalityOptions: ScoutFilterOption[];
  /** Runs the search with the filters on screen (#147: the search never runs by itself). */
  onSearch: () => void;
  /** The filters on screen differ from the last search. */
  dirty: boolean;
  saved: SavedScoutFilter[];
  onSave: (name: string) => void;
  onLoadSaved: (entry: SavedScoutFilter) => void;
  onRemoveSaved: (name: string) => void;
}) {
  const { t } = useTranslation();
  const handleReset = () => {
    setFilters(createDefaultScoutFilters());
  };

  const positionOptions = POSITION_FILTERS.map(({ value, detailed }) => ({
    value,
    label: detailed ? `– ${t(`roles.detailed.${value}`)}` : t(`scout.filters.positions.${value}`),
  }));

  return (
    <form
      className="card-arcade rounded-md p-5"
      onSubmit={(e) => { e.preventDefault(); onSearch(); }}
    >
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-display font-black uppercase text-xl leading-none m-0">
          {t("scout.filters.searchFilters")}
        </h2>
        <button
          type="button"
          onClick={handleReset}
          className="flex items-center gap-2 text-[13px] text-muted-foreground hover:text-primary transition-colors font-bold uppercase tracking-[0.08em] cursor-pointer bg-transparent border-0 font-display"
        >
          <Icon name="rotate-ccw" className="w-3.5 h-3.5" />
          {t("scout.filters.reset")}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
        {/* Name Search */}
        <div className="col-span-2">
          <label className="block text-[13px] text-muted-foreground mb-2 font-bold uppercase tracking-[0.08em] font-display">
            {t("scout.filters.playerName")}
          </label>
          <div className="relative">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={filters.name}
              onChange={(e) => setFilters({ ...filters, name: e.target.value })}
              placeholder={t("scout.filters.searchByName")}
              className={`${inputClass} pl-10`}
            />
          </div>
        </div>

        {/* Position */}
        <SelectListbox
          label={t("scout.filters.position")}
          value={filters.position}
          onChange={(v) => setFilters({ ...filters, position: v })}
          options={positionOptions}
        />

        {/* Age Range */}
        <RangeBox label={t("scout.filters.ageRange")}
          min={<StepperField value={filters.minAge} min={16} max={45} step={intStep} downLabel={t("common.decrease")} upLabel={t("common.increase")}
              onChange={(v) => setFilters({ ...filters, minAge: Math.round(v) })} />}
          max={<StepperField value={filters.maxAge} min={16} max={45} step={intStep} downLabel={t("common.decrease")} upLabel={t("common.increase")}
              onChange={(v) => setFilters({ ...filters, maxAge: Math.round(v) })} />} />

        {/* OVR range: shown 0–100 like the table, kept 0–10 in the filter (tester report, 8.8.3) */}
        <RangeBox label={t("scout.filters.ovr")} title={t("scout.filters.ovrHint")}
          min={<StepperField value={Math.round(filters.minAvg * 10)} min={0} max={100} step={intStep} downLabel={t("common.decrease")} upLabel={t("common.increase")}
              onChange={(v) => setFilters({ ...filters, minAvg: Math.round(v) / 10 })} />}
          max={<StepperField value={Math.round(filters.maxAvg * 10)} min={0} max={100} step={intStep} downLabel={t("common.decrease")} upLabel={t("common.increase")}
              onChange={(v) => setFilters({ ...filters, maxAvg: Math.round(v) / 10 })} />} />

        {/* Value (transfer price), millions of euros: two columns so "1000" fits (#154) */}
        <RangeBox label={t("scout.filters.valueRange")}
          min={<StepperField value={filters.minPriceM} min={0} max={PRICE_FILTER_NO_LIMIT_M} step={stepPriceM} parse={parsePriceM} format={oneDecimal}
              downLabel={t("common.decrease")} upLabel={t("common.increase")} ariaLabel={t("common.min")}
              onChange={(v) => setFilters({ ...filters, minPriceM: v })} />}
          max={<StepperField value={filters.maxPriceM} min={0} max={PRICE_FILTER_NO_LIMIT_M} step={stepPriceM} parse={parsePriceM} format={priceMax}
              downLabel={t("common.decrease")} upLabel={t("common.increase")} ariaLabel={t("common.max")}
              onChange={(v) => setFilters({ ...filters, maxPriceM: v })} />} />

        {/* League — searchable: ~84 options labelled "League · Country" */}
        <SelectCombobox
          label={t("scout.filters.league")}
          value={filters.league}
          onChange={(v) => setFilters({ ...filters, league: v })}
          options={leagueOptions}
        />

        <SelectListbox
          label={t("scout.filters.nationality")}
          value={filters.nationality}
          onChange={(v) => setFilters({ ...filters, nationality: v })}
          options={nationalityOptions}
        />

        {/* Potential (0–100): the middle of the shown range, his overall past 23 */}
        <RangeBox label={t("scout.filters.potential")}
          min={<StepperField value={filters.minPotential ?? 0} min={0} max={100} step={potStep} downLabel={t("common.decrease")} upLabel={t("common.increase")}
              onChange={(v) => setFilters({ ...filters, minPotential: Math.round(v) })} />}
          max={<StepperField value={filters.maxPotential ?? 100} min={0} max={100} step={potStep} downLabel={t("common.decrease")} upLabel={t("common.increase")}
              onChange={(v) => setFilters({ ...filters, maxPotential: Math.round(v) })} />} />

        {/* Grade of the scout's latest report: any of the ticked ones */}
        <div className="col-span-2">
          <label
            className="block text-[13px] text-muted-foreground mb-2 font-bold uppercase tracking-[0.08em] font-display"
            title={t("scout.filters.gradeHint")}
          >
            {t("scout.filters.grade")}
          </label>
          <div className="flex flex-wrap gap-2">
            {SCOUT_GRADES.map((g) => {
              const on = (filters.grades ?? []).includes(g);
              return (
                <Chip
                  key={g}
                  selected={on}
                  title={t("scout.filters.gradeHint")}
                  onClick={() => setFilters({
                    ...filters,
                    grades: on ? (filters.grades ?? []).filter((x) => x !== g) : [...(filters.grades ?? []), g],
                  })}
                >
                  {g}
                </Chip>
              );
            })}
          </div>
        </div>
      </div>

      {/* For Sale Only toggle */}
      <div className="mt-4 pt-4 border-t border-border/40 flex flex-wrap gap-2">
        <Chip selected={!!filters.onlyForSale} title={t("scout.filters.availabilityHint")} onClick={() => setFilters({ ...filters, onlyForSale: !filters.onlyForSale })}>
          <Icon name="tag" className="w-4 h-4" />
          {t("scout.filters.forSaleOnly")}
        </Chip>
        <Chip selected={!!filters.onlyFree} title={t("scout.filters.availabilityHint")} onClick={() => setFilters({ ...filters, onlyFree: !filters.onlyFree })}>
          <Icon name="tag" className="w-4 h-4" />
          {t("scout.filters.freeAgentsOnly")}
        </Chip>
        <Chip selected={!!filters.onlyShortlist} onClick={() => setFilters({ ...filters, onlyShortlist: !filters.onlyShortlist })}>
          <Icon name="star" className="w-4 h-4" />
          {t("scouting.filters.onlyShortlist")}
        </Chip>
        <Chip
          selected={(filters.minKnowledge ?? 0) >= 60}
          onClick={() => setFilters({ ...filters, minKnowledge: (filters.minKnowledge ?? 0) >= 60 ? 0 : 60 })}
        >
          <Icon name="binoculars" className="w-4 h-4" />
          {t("scouting.filters.known")}
        </Chip>
        <Chip selected={!!filters.onlyAwarded} onClick={() => setFilters({ ...filters, onlyAwarded: !filters.onlyAwarded })}>
          <Icon name="award" className="w-4 h-4" />
          {t("scout.filters.awardedOnly")}
        </Chip>
        <Chip
          selected={!!filters.onlyAffordable}
          onClick={() => setFilters({ ...filters, onlyAffordable: !filters.onlyAffordable })}
          title={t("scout.filters.affordableHint")}
        >
          <Icon name="wallet" className="w-4 h-4" />
          {t("scout.filters.affordableOnly")}
        </Chip>
        <Chip
          selected={!!filters.onlyPreContract}
          onClick={() => setFilters({ ...filters, onlyPreContract: !filters.onlyPreContract })}
          title={t("scout.filters.preContractHint")}
        >
          <Icon name="calendar" className="w-4 h-4" />
          {t("scout.filters.preContractOnly")}
        </Chip>
        <Chip
          selected={!!filters.onlyLoanable}
          onClick={() => setFilters({ ...filters, onlyLoanable: !filters.onlyLoanable })}
          title={t("scout.filters.loanableHint")}
        >
          <Icon name="handshake" className="w-4 h-4" />
          {t("scout.filters.loanableOnly")}
        </Chip>
      </div>

      <ScoutAttributeFiltersDisclosure filters={filters} setFilters={setFilters} />

      <div className="mt-5 pt-4 border-t border-border/40 flex flex-wrap items-end justify-between gap-4">
        <SavedScoutFilters saved={saved} onSave={onSave} onLoad={onLoadSaved} onRemove={onRemoveSaved} />
        <div className="flex items-center gap-3 ml-auto">
          {dirty && <span className="text-sm text-muted-foreground">{t("scout.filters.changed")}</span>}
          <Button type="submit">
            <Icon name="search" size={16} />
            {t("scout.filters.search")}
          </Button>
        </div>
      </div>
    </form>
  );
}

/** One filter with a minimum and a maximum, in a box of its own (tester report, 8.8.5: the four steppers of a row read as one). */
function RangeBox({ label, title, min, max }: { label: string; title?: string; min: ReactNode; max: ReactNode }) {
  const { t } = useTranslation();
  return (
    <fieldset className="col-span-2 m-0 min-w-0 rounded-md border border-border px-3 pb-3 pt-1">
      <legend className="px-1 text-[13px] text-muted-foreground font-bold uppercase tracking-[0.08em] font-display" title={title}>{label}</legend>
      <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-2">
        <span className="text-sm text-muted-foreground">{t("common.min")}</span>
        {min}
        <span className="text-sm text-muted-foreground">{t("common.max")}</span>
        {max}
      </div>
    </fieldset>
  );
}

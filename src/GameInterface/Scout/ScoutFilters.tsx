import { useTranslation } from "react-i18next";
import { SelectListbox, formSelectBoxClass } from "@/GameInterface/Components/SelectListbox";
import { SelectCombobox } from "@/GameInterface/Components/SelectCombobox";
import { ScoutAttributeFiltersDisclosure } from "@/GameInterface/Scout/ScoutAttributeFiltersDisclosure";
import {
  createDefaultScoutFilters,
  PRICE_FILTER_NO_LIMIT_M,
  type ScoutFilterState,
} from "@/Domain/scout/scoutFilterState";
import { Icon } from "@/GameInterface/Icons";
import { Chip } from "@/GameInterface/ui/Chip";
import { Button } from "@/GameInterface/ui/Button";
import { SavedScoutFilters } from "@/GameInterface/Scout/SavedScoutFilters";
import type { SavedScoutFilter } from "@/Domain/scout/savedFilters";

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
        <div>
          <label className="block text-[13px] text-muted-foreground mb-2 font-bold uppercase tracking-[0.08em] font-display">
            {t("scout.filters.ageRange")}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={16}
              max={45}
              value={filters.minAge}
              onChange={(e) => setFilters({ ...filters, minAge: parseInt(e.target.value) || 16 })}
              className={inputClass}
            />
            <span className="text-muted-foreground text-sm font-bold">-</span>
            <input
              type="number"
              min={16}
              max={45}
              value={filters.maxAge}
              onChange={(e) => setFilters({ ...filters, maxAge: parseInt(e.target.value) || 40 })}
              className={inputClass}
            />
          </div>
        </div>

        {/* Avg Skill Range */}
        <div>
          <label className="block text-[13px] text-muted-foreground mb-2 font-bold uppercase tracking-[0.08em] font-display">
            {t("common.avgSkill")}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={10}
              step={0.1}
              value={filters.minAvg}
              onChange={(e) => setFilters({ ...filters, minAvg: parseFloat(e.target.value) || 0 })}
              className={inputClass}
            />
            <span className="text-muted-foreground text-sm font-bold">-</span>
            <input
              type="number"
              min={0}
              max={10}
              step={0.1}
              value={filters.maxAvg}
              onChange={(e) => setFilters({ ...filters, maxAvg: parseFloat(e.target.value) || 10 })}
              className={inputClass}
            />
          </div>
        </div>

        {/* Value (transfer price), millions of euros: two columns so "1000" fits (#154) */}
        <div className="col-span-2">
          <label className="block text-[13px] text-muted-foreground mb-2 font-bold uppercase tracking-[0.08em] font-display">
            {t("scout.filters.valueRange")}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              step={0.1}
              value={filters.minPriceM}
              onChange={(e) => setFilters({ ...filters, minPriceM: parseFloat(e.target.value) || 0 })}
              placeholder={t("common.min")}
              className={inputClass}
            />
            <span className="text-muted-foreground text-sm font-bold">-</span>
            <input
              type="number"
              min={0}
              step={0.5}
              value={filters.maxPriceM}
              onChange={(e) => setFilters({ ...filters, maxPriceM: parseFloat(e.target.value) || PRICE_FILTER_NO_LIMIT_M })}
              placeholder={t("common.max")}
              className={inputClass}
            />
          </div>
        </div>

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
      </div>

      {/* For Sale Only toggle */}
      <div className="mt-4 pt-4 border-t border-border/40 flex flex-wrap gap-2">
        <Chip selected={!!filters.onlyForSale} onClick={() => setFilters({ ...filters, onlyForSale: !filters.onlyForSale })}>
          <Icon name="tag" className="w-4 h-4" />
          {t("scout.filters.forSaleOnly")}
        </Chip>
        <Chip selected={!!filters.onlyFree} onClick={() => setFilters({ ...filters, onlyFree: !filters.onlyFree })}>
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

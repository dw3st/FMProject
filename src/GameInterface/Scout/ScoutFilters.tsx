import { useTranslation } from "react-i18next";
import { Search, RotateCcw, Tag } from "lucide-react";
import { SelectListbox, formSelectBoxClass } from "@/GameInterface/Components/SelectListbox";
import { SelectCombobox } from "@/GameInterface/Components/SelectCombobox";
import { ScoutAttributeFiltersDisclosure } from "@/GameInterface/Scout/ScoutAttributeFiltersDisclosure";
import {
  createDefaultScoutFilters,
  type ScoutFilterState,
} from "@/GameInterface/Scout/scoutFilterState";

export type { ScoutFilterState };
export { createDefaultScoutFilters, defaultAttributeRanges } from "@/GameInterface/Scout/scoutFilterState";

export type ScoutFilterOption = { value: string; label: string };

/** Filter values: main roles only (matches `getMainRole` on each player’s primary position). */
const MAIN_POSITION_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All positions" },
  { value: "GK", label: "Goalkeeper" },
  { value: "Defender", label: "Defender" },
  { value: "Midfielder", label: "Midfielder" },
  { value: "Forward", label: "Forward" },
];

const inputClass = formSelectBoxClass;

export function ScoutFilters({
  filters,
  setFilters,
  leagueOptions,
  nationalityOptions,
}: {
  filters: ScoutFilterState;
  setFilters: (f: ScoutFilterState) => void;
  leagueOptions: ScoutFilterOption[];
  nationalityOptions: ScoutFilterOption[];
}) {
  const { t } = useTranslation();
  const handleReset = () => {
    setFilters(createDefaultScoutFilters());
  };

  const positionOptions = MAIN_POSITION_FILTERS;

  return (
    <div className="card-arcade rounded-xl p-5">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-sm font-black text-foreground font-display uppercase tracking-wider m-0">
          {t("scout.filters.searchFilters")}
        </h2>
        <button
          onClick={handleReset}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors font-semibold uppercase tracking-wider cursor-pointer bg-transparent border-0"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          {t("scout.filters.reset")}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
        {/* Name Search */}
        <div className="col-span-2">
          <label className="block text-xs text-muted-foreground mb-2 font-semibold uppercase tracking-wider">
            {t("scout.filters.playerName")}
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
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
          <label className="block text-xs text-muted-foreground mb-2 font-semibold uppercase tracking-wider">
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
            <span className="text-muted-foreground text-xs font-bold">-</span>
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
          <label className="block text-xs text-muted-foreground mb-2 font-semibold uppercase tracking-wider">
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
            <span className="text-muted-foreground text-xs font-bold">-</span>
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

        {/* Value (transfer price), millions £ */}
        <div>
          <label className="block text-xs text-muted-foreground mb-2 font-semibold uppercase tracking-wider">
            Value (M £)
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
            <span className="text-muted-foreground text-xs font-bold">-</span>
            <input
              type="number"
              min={0}
              step={0.5}
              value={filters.maxPriceM}
              onChange={(e) => setFilters({ ...filters, maxPriceM: parseFloat(e.target.value) || 200 })}
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
      <div className="mt-4 pt-4 border-t border-border/40">
        <button
          type="button"
          onClick={() => setFilters({ ...filters, onlyForSale: !filters.onlyForSale })}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all cursor-pointer ${
            filters.onlyForSale
              ? "bg-primary/20 text-primary border-primary/40"
              : "bg-muted/20 text-muted-foreground border-border hover:text-primary hover:border-primary/30"
          }`}
        >
          <Tag className="w-3.5 h-3.5" />
          {t("scout.filters.forSaleOnly")}
        </button>
      </div>

      <ScoutAttributeFiltersDisclosure filters={filters} setFilters={setFilters} />
    </div>
  );
}

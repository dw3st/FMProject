import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Disclosure, DisclosureButton, DisclosurePanel } from "@headlessui/react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import {
  defaultAttributeRanges,
  type ScoutFilterState,
} from "@/GameInterface/Scout/scoutFilterState";
import { ATTRIBUTE_LIST, ATTRIBUTE_LABELS, type AttributeId } from "@/GameInterface/AttributeLabels";

// ── Range slider (adapted from TacticSlider in FormationScreen) ───────────────

interface AttrRangeSliderProps {
  label: string;
  description?: string;
  minValue: number;
  maxValue: number;
  onChange: (min: number, max: number) => void;
  t?: (key: string) => string;
}

function AttrRangeSlider({
  label,
  description,
  minValue,
  maxValue,
  onChange,
  t: i18n,
}: AttrRangeSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const MAX = 10;
  const minPct = (minValue / MAX) * 100;
  const maxPct = (maxValue / MAX) * 100;
  const isActive = minValue > 0 || maxValue < MAX;

  const resolveFromX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const nearest = Math.round(ratio * MAX);
      // Move whichever thumb is closer to the click
      const distToMin = Math.abs(nearest - minValue);
      const distToMax = Math.abs(nearest - maxValue);
      if (distToMin <= distToMax) {
        onChange(Math.min(nearest, maxValue), maxValue);
      } else {
        onChange(minValue, Math.max(nearest, minValue));
      }
    },
    [minValue, maxValue, onChange],
  );

  return (
    <div
      className={`rounded-lg border px-3 py-2 min-w-0 transition-colors ${
        isActive ? "bg-primary/5 border-primary/30" : "bg-background/50 border-border/50"
      }`}
    >
      {/* Label + value */}
      <div className="flex items-center justify-between gap-1 mb-1">
        <span className="text-[11px] font-semibold text-foreground truncate" title={description}>
          {label}
        </span>
        <span
          className={`text-[11px] font-bold tabular-nums shrink-0 ${
            isActive ? "text-primary" : "text-muted-foreground/50"
          }`}
        >
          {minValue === 0 && maxValue === MAX ? (i18n ? i18n("scout.attributeFilters.any") : "any") : `${minValue} – ${maxValue}`}
        </span>
      </div>

      {/* Clickable track */}
      <div
        ref={trackRef}
        className="relative h-6 flex items-center cursor-pointer"
        onClick={(e) => resolveFromX(e.clientX)}
      >
        <div className="h-1.5 w-full bg-muted rounded-full relative">
          {/* Active fill between the two thumbs */}
          <div
            className="absolute top-0 h-full bg-primary rounded-full transition-all duration-150"
            style={{ left: `${minPct}%`, right: `${100 - maxPct}%` }}
          />
        </div>

        {/* Min thumb */}
        <div
          className="absolute top-1/2 w-4 h-4 bg-white rounded-full shadow-lg border-2 border-primary -translate-x-1/2 -translate-y-1/2 transition-all duration-150 hover:scale-110 pointer-events-none"
          style={{ left: `${minPct}%` }}
        />
        {/* Max thumb */}
        <div
          className="absolute top-1/2 w-4 h-4 bg-white rounded-full shadow-lg border-2 border-primary -translate-x-1/2 -translate-y-1/2 transition-all duration-150 hover:scale-110 pointer-events-none"
          style={{ left: `${maxPct}%` }}
        />
      </div>
    </div>
  );
}

// ── Active filter count ───────────────────────────────────────────────────────

function activeAttributeFilterCount(ranges: ScoutFilterState["attributeRanges"]): number {
  let n = 0;
  for (const a of Object.keys(ATTRIBUTE_LABELS) as AttributeId[]) {
    const row = ranges[a];
    if (row && (row.min > 0 || row.max < 10)) n += 1;
  }
  return n;
}

// ── Disclosure wrapper ────────────────────────────────────────────────────────

export function ScoutAttributeFiltersDisclosure({
  filters,
  setFilters,
}: {
  filters: ScoutFilterState;
  setFilters: (f: ScoutFilterState) => void;
}) {
  const { t } = useTranslation();
  const active = activeAttributeFilterCount(filters.attributeRanges);

  function patchAttr(id: AttributeId, min: number, max: number) {
    setFilters({
      ...filters,
      attributeRanges: { ...filters.attributeRanges, [id]: { min, max } },
    });
  }

  return (
    <Disclosure as="div" className="w-full mt-5" defaultOpen>
      {({ open }) => (
        <>
          <DisclosureButton
            type="button"
            className="card-arcade flex w-full items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 text-left transition-colors hover:bg-muted/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <span className="flex items-center gap-3 min-w-0">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 border border-primary/30">
                <SlidersHorizontal className="h-4 w-4 text-primary" aria-hidden />
              </span>
              <span>
                <span className="block text-sm font-black uppercase tracking-wider text-foreground font-display">
                  {t("scout.attributeFilters.attributes")}
                </span>
                <span className="block text-[11px] text-muted-foreground font-medium mt-0.5">
                  {t("scout.attributeFilters.description")}
                </span>
              </span>
              {active > 0 && (
                <span className="min-w-[1.5rem] h-6 px-1.5 rounded-md bg-primary text-[11px] font-black text-primary-foreground leading-none flex items-center justify-center shrink-0">
                  {active}
                </span>
              )}
            </span>
            <ChevronDown
              className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            />
          </DisclosureButton>

          <div className="overflow-hidden">
            <DisclosurePanel
              transition
              className="origin-top transition duration-200 ease-out data-[closed]:opacity-0 data-[closed]:-translate-y-1"
            >
              <div className="pt-4 flex flex-col gap-3">
                <div className="flex justify-end">
                  <button
                    type="button"
                    className="text-[10px] font-bold uppercase tracking-wider text-primary hover:underline cursor-pointer bg-transparent border-0 p-0"
                    onClick={() =>
                      setFilters({ ...filters, attributeRanges: defaultAttributeRanges() })
                    }
                  >
                    {t("scout.attributeFilters.clearAll")}
                  </button>
                </div>

                <div className="card-arcade rounded-xl border border-border/50 p-4 w-full">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 w-full">
                    {ATTRIBUTE_LIST.map((attr) => {
                      const row = filters.attributeRanges[attr.id] ?? { min: 0, max: 10 };
                      return (
                        <AttrRangeSlider
                          key={attr.id}
                          label={attr.label}
                          description={attr.description}
                          minValue={row.min}
                          maxValue={row.max}
                          onChange={(min, max) => patchAttr(attr.id, min, max)}
                          t={t}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            </DisclosurePanel>
          </div>
        </>
      )}
    </Disclosure>
  );
}

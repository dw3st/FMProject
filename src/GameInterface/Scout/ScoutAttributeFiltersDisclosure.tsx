import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Disclosure, DisclosureButton, DisclosurePanel } from "@headlessui/react";
import {
  ATTR_INPUT_MAX,
  ATTR_INPUT_MIN,
  ATTRIBUTE_GROUPS,
  defaultAttributeRanges,
  isAnyRange,
  orderedRange,
  parseAttrBound,
  type ScoutFilterState,
} from "@/Domain/scout/scoutFilterState";
import type { AttributeId } from "@/Domain/attributes";
import { attributeText } from "@/GameInterface/attributeText";
import { Icon } from "@/GameInterface/Icons";

type Range = { min: number; max: number };

/** Text shown in a bound field: empty when that side has no limit. */
const boundText = (v: number, side: "min" | "max") =>
  (side === "min" ? v <= 0 : v >= 100) ? "" : String(v);

/**
 * One typed bound (#147). Keeps what the user is typing and reports the parsed value; follows the
 * value when it changes from outside (reset, a saved filter).
 */
function BoundInput({ value, side, label, onChange }: {
  value: number;
  side: "min" | "max";
  label: string;
  onChange: (v: number) => void;
}) {
  const [text, setText] = useState(() => boundText(value, side));
  useEffect(() => {
    if (parseAttrBound(text, side) !== value) setText(boundText(value, side));
    // Only an outside change of `value` resyncs the field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, side]);
  return (
    <input
      type="number"
      inputMode="numeric"
      min={ATTR_INPUT_MIN}
      max={ATTR_INPUT_MAX}
      value={text}
      placeholder={String(side === "min" ? ATTR_INPUT_MIN : ATTR_INPUT_MAX)}
      aria-label={label}
      onChange={(e) => {
        setText(e.target.value);
        onChange(parseAttrBound(e.target.value, side));
      }}
      className="w-16 h-8 bg-input border border-border rounded-lg px-2 text-sm text-center tabular-nums text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
    />
  );
}

function AttrRow({ id, range, onChange }: { id: AttributeId; range: Range; onChange: (r: Range) => void }) {
  const { t } = useTranslation();
  const text = attributeText(t, id);
  const active = !isAnyRange(range);
  const shown = orderedRange(range.min, range.max);
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="flex-1 min-w-0 truncate text-sm font-semibold text-foreground" title={text.description}>
        {text.name}
      </span>
      <BoundInput
        value={range.min}
        side="min"
        label={t("scout.attributeFilters.minOf", { attr: text.name })}
        onChange={(min) => onChange({ min, max: range.max })}
      />
      <span className="text-sm text-muted-foreground" aria-hidden>–</span>
      <BoundInput
        value={range.max}
        side="max"
        label={t("scout.attributeFilters.maxOf", { attr: text.name })}
        onChange={(max) => onChange({ min: range.min, max })}
      />
      <span className={`w-16 shrink-0 text-right text-sm font-bold tabular-nums ${active ? "text-primary" : "text-muted-foreground/60"}`}>
        {active ? `${Math.max(ATTR_INPUT_MIN, shown.min)}–${shown.max}` : t("scout.attributeFilters.any")}
      </span>
    </div>
  );
}

function activeCount(ranges: ScoutFilterState["attributeRanges"], ids: AttributeId[]): number {
  return ids.filter((id) => ranges[id] && !isAnyRange(ranges[id])).length;
}

function CountBadge({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="min-w-[1.5rem] h-6 px-1.5 rounded-md bg-primary text-sm font-black text-primary-foreground leading-none flex items-center justify-center shrink-0 tabular-nums">
      {n}
    </span>
  );
}

/** Attribute filters (#147): one collapsible block per group, min/max typed on the 1–100 scale. */
export function ScoutAttributeFiltersDisclosure({
  filters,
  setFilters,
}: {
  filters: ScoutFilterState;
  setFilters: (f: ScoutFilterState) => void;
}) {
  const { t } = useTranslation();
  const ranges = filters.attributeRanges;
  const total = activeCount(ranges, ATTRIBUTE_GROUPS.flatMap((g) => g.attributes));

  function patchAttr(id: AttributeId, r: Range) {
    setFilters({ ...filters, attributeRanges: { ...ranges, [id]: r } });
  }

  return (
    <Disclosure as="div" className="w-full mt-5" defaultOpen>
      {({ open }) => (
        <>
          <DisclosureButton
            type="button"
            className="card-arcade flex w-full items-center justify-between gap-3 rounded-md border border-border px-4 py-3 text-left transition-colors hover:bg-muted/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <span className="flex items-center gap-3 min-w-0">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 border border-primary/30">
                <Icon name="sliders-horizontal" className="h-4 w-4 text-primary" aria-hidden />
              </span>
              <span>
                <span className="block text-sm font-bold uppercase tracking-[0.08em] text-foreground font-display">
                  {t("scout.attributeFilters.attributes")}
                </span>
                <span className="block text-sm text-muted-foreground font-medium mt-0.5">
                  {t("scout.attributeFilters.description")}
                </span>
              </span>
              <CountBadge n={total} />
            </span>
            <Icon name="chevron-down"
              className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            />
          </DisclosureButton>

          <DisclosurePanel className="pt-4 flex flex-col gap-3">
            <div className="flex justify-end">
              <button
                type="button"
                className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground cursor-pointer bg-transparent border-0 p-0 font-display"
                onClick={() => setFilters({ ...filters, attributeRanges: defaultAttributeRanges() })}
              >
                {t("scout.attributeFilters.clearAll")}
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 items-start">
              {ATTRIBUTE_GROUPS.map((group) => (
                <Disclosure key={group.id} as="div" defaultOpen className="rounded-md border border-border/60 bg-background/40">
                  {({ open: groupOpen }) => (
                    <>
                      <DisclosureButton
                        type="button"
                        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left bg-transparent border-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-md"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">
                            {t(`scout.attributeFilters.groups.${group.id}`)}
                          </span>
                          <CountBadge n={activeCount(ranges, group.attributes)} />
                        </span>
                        <Icon name="chevron-down"
                          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${groupOpen ? "rotate-180" : ""}`}
                        />
                      </DisclosureButton>
                      <DisclosurePanel className="px-3 pb-3 flex flex-col gap-2">
                        {group.attributes.map((id) => (
                          <AttrRow
                            key={id}
                            id={id}
                            range={ranges[id] ?? { min: 0, max: 100 }}
                            onChange={(r) => patchAttr(id, r)}
                          />
                        ))}
                      </DisclosurePanel>
                    </>
                  )}
                </Disclosure>
              ))}
            </div>
          </DisclosurePanel>
        </>
      )}
    </Disclosure>
  );
}

import { Fragment, useState, type ReactNode } from "react";
import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from "@headlessui/react";
import { useTranslation } from "react-i18next";
import { formSelectBoxClass } from "@/GameInterface/Components/SelectListbox";
import { Icon } from "@/GameInterface/Icons";

/**
 * `group`/`subgroup` (optional) render a header row whenever they change from the previous
 * visible option, so the list can be grouped (e.g. continent -> country -> competition).
 * Options must already be sorted by group.
 */
type Option<T extends string> = { value: T; label: string; group?: string; subgroup?: string };

export function SelectCombobox<T extends string>({
  label,
  labelId,
  value,
  onChange,
  options,
  leadingIcon,
  placeholder,
  className,
  disabled,
  emptyMessage,
}: {
  label?: string;
  labelId?: string;
  value: T;
  onChange: (v: T) => void;
  options: Option<T>[];
  leadingIcon?: ReactNode;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  emptyMessage?: string;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const id = labelId ?? (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);
  const finalPlaceholder = placeholder ?? t("common.search");
  const finalEmptyMessage = emptyMessage ?? "No matches";

  const filtered =
    query === ""
      ? options
      : options.filter((o) =>
          `${o.label} ${o.value} ${o.group ?? ""} ${o.subgroup ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()),
        );

  const displayForValue = (v: T) => options.find((o) => o.value === v)?.label ?? "";

  return (
    <div className={className}>
      {label && (
        <span
          id={id}
          className="block text-[13px] text-muted-foreground mb-2 font-bold uppercase tracking-[0.08em] font-display"
        >
          {label}
        </span>
      )}
      <Combobox
        value={value}
        disabled={disabled}
        onChange={(v: T | null) => {
          if (v != null) onChange(v);
        }}
        onClose={() => setQuery("")}
      >
        <div className="relative">
          <div
            className={`flex items-center gap-2 ${formSelectBoxClass} cursor-text ${leadingIcon ? "pl-2.5" : ""}`}
          >
            {leadingIcon}
            <ComboboxInput
              aria-labelledby={id}
              className="flex-1 min-w-0 bg-transparent border-0 p-0 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0"
              displayValue={displayForValue}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={finalPlaceholder}
            />
            <ComboboxButton className="cursor-pointer shrink-0 rounded p-0.5 border-0 bg-transparent text-muted-foreground hover:text-foreground">
              <Icon name="chevron-down" className="w-4 h-4" />
            </ComboboxButton>
          </div>
          <ComboboxOptions className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-lg bg-card border border-border py-1 text-sm focus:outline-none">
            {filtered.length === 0 && (
              <div className="px-3 py-2.5 text-sm text-muted-foreground text-center">{finalEmptyMessage}</div>
            )}
            {filtered.map((opt, i) => {
              const prev = filtered[i - 1];
              const newGroup = opt.group !== undefined && opt.group !== prev?.group;
              const newSubgroup = opt.subgroup !== undefined && (newGroup || opt.subgroup !== prev?.subgroup);
              return (
              <Fragment key={opt.value}>
              {newGroup && (
                <div className="px-3 pt-3 pb-1 font-display font-bold uppercase tracking-[0.08em] text-xs text-muted-foreground">
                  {opt.group}
                </div>
              )}
              {newSubgroup && (
                <div className="px-3 pt-1.5 pb-0.5 text-[13px] font-semibold text-muted-foreground">{opt.subgroup}</div>
              )}
              <ComboboxOption
                value={opt.value}
                className={`group flex items-center justify-between gap-2 ${opt.subgroup ? "pl-6 pr-3" : "px-3"} py-2 cursor-pointer transition-colors data-[focus]:bg-primary/10 data-[selected]:text-primary`}
              >
                <span className="font-medium truncate">{opt.label}</span>
                <Icon name="check" className="w-4 h-4 opacity-0 group-data-[selected]:opacity-100 text-primary shrink-0" />
              </ComboboxOption>
              </Fragment>
              );
            })}
          </ComboboxOptions>
        </div>
      </Combobox>
    </div>
  );
}

import { useState, type ReactNode } from "react";
import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from "@headlessui/react";
import { Check, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formSelectBoxClass } from "@/GameInterface/Components/SelectListbox";

type Option<T extends string> = { value: T; label: string };

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
          `${o.label} ${o.value}`.toLowerCase().includes(query.trim().toLowerCase()),
        );

  const displayForValue = (v: T) => options.find((o) => o.value === v)?.label ?? "";

  return (
    <div className={className}>
      {label && (
        <span
          id={id}
          className="block text-xs text-muted-foreground mb-2 font-semibold uppercase tracking-wider"
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
              <ChevronDown className="w-4 h-4" />
            </ComboboxButton>
          </div>
          <ComboboxOptions className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-lg bg-card border border-border shadow-xl py-1 text-sm focus:outline-none">
            {filtered.length === 0 && (
              <div className="px-3 py-2.5 text-sm text-muted-foreground text-center">{finalEmptyMessage}</div>
            )}
            {filtered.map((opt) => (
              <ComboboxOption
                key={opt.value}
                value={opt.value}
                className="group flex items-center justify-between gap-2 px-3 py-2 cursor-pointer transition-colors data-[focus]:bg-primary/10 data-[selected]:text-primary"
              >
                <span className="font-medium truncate">{opt.label}</span>
                <Check className="w-4 h-4 opacity-0 group-data-[selected]:opacity-100 text-primary shrink-0" />
              </ComboboxOption>
            ))}
          </ComboboxOptions>
        </div>
      </Combobox>
    </div>
  );
}

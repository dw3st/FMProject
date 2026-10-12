import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { Chip } from "@/GameInterface/ui/Chip";
import { Button } from "@/GameInterface/ui/Button";
import { formSelectBoxClass } from "@/GameInterface/Components/SelectListbox";
import { SAVED_FILTER_NAME_MAX, savedFilterName, type SavedScoutFilter } from "@/Domain/scout/savedFilters";

/** Named search filters (#147): as many as the user wants; a click loads one and searches. */
export function SavedScoutFilters({ saved, onSave, onLoad, onRemove }: {
  saved: SavedScoutFilter[];
  onSave: (name: string) => void;
  onLoad: (entry: SavedScoutFilter) => void;
  onRemove: (name: string) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const canSave = savedFilterName(name) !== "";

  function save() {
    if (!canSave) return;
    onSave(name);
    setName("");
  }

  return (
    <div className="flex flex-col gap-2 min-w-0 flex-1">
      <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">
        {t("scout.savedFilters.title")}
      </span>
      {saved.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {saved.map((s) => (
            <span key={s.name} className="inline-flex items-center gap-1">
              <Chip selected={false} onClick={() => onLoad(s)} title={t("scout.savedFilters.load")}>
                {s.name}
              </Chip>
              <button
                type="button"
                onClick={() => onRemove(s.name)}
                aria-label={t("scout.savedFilters.remove", { name: s.name })}
                title={t("scout.savedFilters.remove", { name: s.name })}
                className="inline-flex items-center justify-center w-8 h-8 rounded bg-transparent border-0 text-muted-foreground hover:text-destructive cursor-pointer"
              >
                <Icon name="close" size={16} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 max-w-md">
        <input
          type="text"
          value={name}
          maxLength={SAVED_FILTER_NAME_MAX}
          onChange={(e) => setName(e.target.value)}
          // Enter saves here instead of searching.
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } }}
          placeholder={t("scout.savedFilters.namePlaceholder")}
          aria-label={t("scout.savedFilters.nameLabel")}
          className={formSelectBoxClass}
        />
        <Button variant="secondary" onClick={save} disabled={!canSave} className="shrink-0">
          <Icon name="save" size={16} />
          {t("scout.savedFilters.save")}
        </Button>
      </div>
    </div>
  );
}

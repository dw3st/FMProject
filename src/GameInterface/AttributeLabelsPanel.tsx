import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ATTRIBUTE_LIST } from "@/GameInterface/AttributeLabels";

export function AttributeLabelsPanel() {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card-arcade rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-3 py-2 text-left text-sm font-semibold text-foreground hover:bg-secondary/30 transition-colors cursor-pointer bg-transparent border-0"
      >
        <span>{t("attributes.title", "Player attributes")}</span>
        <span className="text-muted-foreground">{expanded ? "▼" : "▶"}</span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-0 border-t border-border">
          <ul className="space-y-2 text-xs mt-3 list-none p-0 m-0">
            {ATTRIBUTE_LIST.map((attr) => (
              <li key={attr.id}>
                <span className="font-semibold text-foreground">{t(`attributes.${attr.id}.label`, attr.label)}</span>
                <span className="text-muted-foreground"> — </span>
                <span className="text-muted-foreground/80">{t(`attributes.${attr.id}.description`, attr.description)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

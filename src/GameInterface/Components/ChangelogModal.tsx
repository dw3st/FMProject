import { DialogTitle } from "@headlessui/react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/GameInterface/Components/Modal";
import { changelog } from "@/GameInterface/changelog/changelog";

interface Props {
  open: boolean;
  onClose: () => void;
}

function localizedDate(iso: string, locale: string): string {
  const d = new Date(iso + "T12:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
}

/** "Novidades" / "What's new" — see .claude/rules/changelog.md. */
export function ChangelogModal({ open, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const lang: "pt" | "en" = i18n.language?.toLowerCase().startsWith("pt") ? "pt" : "en";
  const dateLocale = lang === "pt" ? "pt-BR" : "en-US";

  return (
    <Modal open={open} onClose={onClose} size="md">
      <div className="flex flex-col">
        <div className="px-6 py-4 border-b border-border bg-card/50">
          <DialogTitle
            as="h2"
            className="text-lg font-black font-display text-foreground uppercase tracking-wider m-0"
          >
            {t("changelog.title")}
          </DialogTitle>
          <p className="text-xs text-muted-foreground m-0 mt-0.5">{t("changelog.subtitle")}</p>
        </div>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {changelog.map((entry) => (
            <section key={entry.version}>
              <div className="flex items-baseline gap-2 mb-2">
                <h3 className="text-sm font-black text-foreground m-0">
                  {t("changelog.version", { version: entry.version })}
                </h3>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  {localizedDate(entry.date, dateLocale)}
                </span>
              </div>

              <ul className="list-disc pl-5 space-y-1 text-sm text-foreground/90">
                {entry.items.map((item, i) => (
                  <li key={i}>{item[lang]}</li>
                ))}
              </ul>

              {entry.fixes && entry.fixes.length > 0 && (
                <div className="mt-2">
                  <span className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">
                    {t("changelog.fixes")}
                  </span>
                  <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                    {entry.fixes.map((fix, i) => (
                      <li key={i}>{fix[lang]}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
    </Modal>
  );
}

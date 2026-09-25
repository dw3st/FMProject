import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/GameInterface/Components/Modal";
import { Icon } from "@/GameInterface/Icons";
import { useGameSave } from "@/GameInterface/GameSaveProvider";

const REPORT_TYPES = ["bug", "improvement", "tweak"] as const;
type ReportType = (typeof REPORT_TYPES)[number];

const DESCRIPTION_MIN = 5;
const DESCRIPTION_MAX = 2000;

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Tester-only "Report" modal — see .claude/rules/tester-reports.md. */
export function ReportModal({ open, onClose }: Props) {
  const { t } = useTranslation();
  const { session, currentDate } = useGameSave();

  const [type, setType] = useState<ReportType>("bug");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Reset local state each time the modal is (re)opened.
  useEffect(() => {
    if (!open) return;
    setType("bug");
    setDescription("");
    setError(null);
    setSuccess(false);
    setSubmitting(false);
  }, [open]);

  // Auto-close a moment after a successful send, so the confirmation is still visible.
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(onClose, 1400);
    return () => clearTimeout(timer);
  }, [success, onClose]);

  const trimmedLength = description.trim().length;
  const descriptionValid =
    trimmedLength >= DESCRIPTION_MIN && trimmedLength <= DESCRIPTION_MAX;

  async function submit() {
    if (submitting || !descriptionValid) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type,
          description: description.trim(),
          page: window.location.pathname,
          saveId: session?.saveId,
          gameDate: currentDate || undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? t("reports.errorGeneric"));
        return;
      }
      setSuccess(true);
    } catch {
      setError(t("reports.errorGeneric"));
    } finally {
      setSubmitting(false);
    }
  }

  const TYPE_OPTIONS: { value: ReportType; label: string }[] = [
    { value: "bug", label: t("reports.typeBug") },
    { value: "improvement", label: t("reports.typeImprovement") },
    { value: "tweak", label: t("reports.typeTweak") },
  ];

  return (
    <Modal open={open} onClose={onClose} size="sm">
      <div className="flex flex-col">
        <div className="px-6 py-4 border-b border-border bg-card/50">
          <h2 className="text-lg font-black font-display text-foreground uppercase tracking-wider m-0">
            {t("reports.title")}
          </h2>
          <p className="text-xs text-muted-foreground m-0 mt-0.5">
            {t("reports.subtitle")}
          </p>
        </div>

        <div className="p-6 space-y-5">
          {!success ? (
            <>
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-2">
                  {t("reports.type")}
                </span>
                <div
                  role="radiogroup"
                  aria-label={t("reports.type")}
                  className="flex flex-wrap gap-1.5"
                >
                  {TYPE_OPTIONS.map((opt) => {
                    const active = type === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        disabled={submitting}
                        onClick={() => setType(opt.value)}
                        className={`text-[10px] font-black uppercase tracking-wide px-2.5 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                          active
                            ? "border-primary bg-primary/15 text-primary"
                            : "border-border/60 bg-card/40 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label
                  htmlFor="report-description"
                  className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-2"
                >
                  {t("reports.descriptionLabel")}
                </label>
                <textarea
                  id="report-description"
                  value={description}
                  disabled={submitting}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("reports.descriptionPlaceholder")}
                  rows={5}
                  maxLength={DESCRIPTION_MAX}
                  className="w-full resize-none rounded-xl border border-border/60 bg-card/40 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/60"
                />
                <p className="text-[10px] text-muted-foreground mt-1 m-0">
                  {t("reports.descriptionHint", {
                    min: DESCRIPTION_MIN,
                    max: DESCRIPTION_MAX,
                  })}{" "}
                  ({trimmedLength}/{DESCRIPTION_MAX})
                </p>
              </div>

              {error && (
                <p className="text-sm text-red-400 m-0" role="alert">
                  {error}
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl border border-border text-sm font-bold uppercase tracking-wider text-muted-foreground hover:bg-muted/30 transition-colors cursor-pointer bg-transparent"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={submitting || !descriptionValid}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold uppercase tracking-wider glow-primary hover:scale-[1.02] transition-all cursor-pointer border-0 disabled:opacity-60"
                >
                  {submitting ? t("reports.sending") : t("reports.send")}
                </button>
              </div>
            </>
          ) : (
            <div className="text-center py-4">
              <Icon name="check-circle" size={48} className="text-emerald-400 mx-auto mb-3" />
              <p className="text-base font-black text-emerald-400 m-0">{t("reports.success")}</p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

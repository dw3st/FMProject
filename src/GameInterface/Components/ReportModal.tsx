import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, ClipboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { DialogTitle } from "@headlessui/react";
import { Modal } from "@/GameInterface/Components/Modal";
import { Icon } from "@/GameInterface/Icons";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { validateAttachmentFile } from "@/GameInterface/Components/reportAttachmentValidation";

// "tweak" was dropped from the form (#22) — too close to "improvement". The server still accepts
// it so older reports stay valid.
const REPORT_TYPES = ["bug", "improvement"] as const;
type ReportType = (typeof REPORT_TYPES)[number];

const DESCRIPTION_MIN = 5;
const DESCRIPTION_MAX = 2000;

/** Status codes with a dedicated, translated message — anything else falls back to the
 *  server's raw `error` text (still useful for a genuinely unexpected failure) or errorGeneric. */
const STATUS_MESSAGE_KEYS: Partial<Record<number, string>> = {
  400: "reports.error400",
  403: "reports.error403",
  413: "reports.error413",
  429: "reports.error429",
};

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

  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [attachmentUploadFailed, setAttachmentUploadFailed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset local state each time the modal is (re)opened.
  useEffect(() => {
    if (!open) return;
    setType("bug");
    setDescription("");
    setError(null);
    setSuccess(false);
    setSubmitting(false);
    setAttachment(null);
    setAttachmentError(null);
    setAttachmentUploadFailed(false);
  }, [open]);

  // Object URL preview — created when an attachment is picked, revoked on change/unmount so we
  // never leak a blob: URL.
  useEffect(() => {
    if (!attachment) {
      setAttachmentPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(attachment);
    setAttachmentPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [attachment]);

  // Latest onClose, read from a ref inside the auto-close timeout below — so a parent re-render
  // that passes a new onClose closure (e.g. an inline arrow function) can't reset/postpone a
  // timer already counting down toward the auto-close.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Auto-close a moment after a successful send, so the confirmation is still visible.
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => onCloseRef.current(), 1400);
    return () => clearTimeout(timer);
  }, [success]);

  const trimmedLength = description.trim().length;
  const descriptionValid =
    trimmedLength >= DESCRIPTION_MIN && trimmedLength <= DESCRIPTION_MAX;

  /** Validates and stores a picked/pasted file as the one attachment (client-side pre-check
   *  only — the server re-validates type, size, and magic bytes independently). */
  function applyAttachment(file: File) {
    const result = validateAttachmentFile(file);
    if (!result.ok) {
      setAttachmentError(
        result.error === "type"
          ? t("reports.attachmentErrorType")
          : t("reports.attachmentErrorSize"),
      );
      return;
    }
    setAttachmentError(null);
    setAttachment(file);
  }

  function handleFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) applyAttachment(file);
    e.target.value = ""; // allow picking the same file again after removing it
  }

  function handlePaste(e: ClipboardEvent<HTMLDivElement>) {
    if (submitting || success) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.kind === "file" && (item.type === "image/png" || item.type === "image/jpeg")) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          applyAttachment(file);
        }
        return;
      }
    }
  }

  /** Uploads the picked attachment for an already-filed report. Best-effort: the report itself
   *  is already sent by the time this runs, so a failure here is surfaced as a soft warning
   *  rather than blocking the success state. */
  async function uploadAttachment(reportId: string, file: File): Promise<void> {
    try {
      const res = await fetch(`/api/reports/${reportId}/attachment`, {
        method: "POST",
        headers: { "content-type": file.type },
        body: file,
      });
      if (!res.ok) setAttachmentUploadFailed(true);
    } catch {
      setAttachmentUploadFailed(true);
    }
  }

  async function submit() {
    if (submitting || !descriptionValid) return;
    setSubmitting(true);
    setError(null);
    setAttachmentUploadFailed(false);
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
        const messageKey = STATUS_MESSAGE_KEYS[res.status];
        if (messageKey) {
          setError(t(messageKey));
        } else {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setError(body.error ?? t("reports.errorGeneric"));
        }
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { id?: string };
      if (attachment && body.id) {
        await uploadAttachment(body.id, attachment);
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
  ];

  return (
    <Modal open={open} onClose={onClose} size="sm">
      <div className="flex flex-col" onPaste={handlePaste}>
        <div className="px-6 py-4 border-b border-border bg-card/50">
          <DialogTitle
            as="h2"
            className="text-lg font-black font-display text-foreground uppercase tracking-wider m-0"
          >
            {t("reports.title")}
          </DialogTitle>
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
                <div className="flex flex-wrap gap-1.5">
                  {TYPE_OPTIONS.map((opt) => {
                    const active = type === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        aria-pressed={active}
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

              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-2">
                  {t("reports.attachImage")}
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  disabled={submitting}
                  onChange={handleFileInputChange}
                />
                {attachmentPreviewUrl ? (
                  <div className="relative inline-block">
                    <img
                      src={attachmentPreviewUrl}
                      alt=""
                      className="h-20 w-20 rounded-xl border border-border/60 object-cover"
                    />
                    <button
                      type="button"
                      aria-label={t("reports.attachmentRemove")}
                      disabled={submitting}
                      onClick={() => setAttachment(null)}
                      className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <Icon name="close" size={12} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide px-2.5 py-1.5 rounded-lg border border-border/60 bg-card/40 text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors cursor-pointer"
                  >
                    <Icon name="image" size={14} />
                    {t("reports.attachImage")}
                  </button>
                )}
                <p className="text-[10px] text-muted-foreground mt-1 m-0">
                  {t("reports.attachmentHint")}
                </p>
                {attachmentError && (
                  <p className="text-xs text-red-400 mt-1 m-0" role="alert">
                    {attachmentError}
                  </p>
                )}
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
              {attachmentUploadFailed && (
                <p className="text-xs text-amber-400 mt-2 m-0" role="alert">
                  {t("reports.attachmentUploadFailed")}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

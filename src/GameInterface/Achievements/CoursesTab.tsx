import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatFee } from "@/Domain/money";
import { managerWallet } from "@/Domain/managers/assets";
import {
  COURSES, LANGUAGE_CODE, LICENCE_KINDS, languagesOfCountries, licenceReputation, settledStudies, spokenLanguages,
  type CourseKind,
} from "@/Domain/managers/courses";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { useLeagueCatalog } from "@/GameInterface/World/useLeagueCatalog";
import { formatGameDate } from "@/GameInterface/formatDate";
import { Button } from "@/GameInterface/ui/Button";
import { Chip } from "@/GameInterface/ui/Chip";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";

const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0";

/** Display name of a course language in the screen's language. */
export function languageName(key: string, lang: string, t: (k: string) => string): string {
  if (key === "serbocroatian") return t("courses.serbocroatian");
  const code = LANGUAGE_CODE[key];
  try {
    const name = code ? new Intl.DisplayNames([lang], { type: "language" }).of(code) : undefined;
    if (name) return name.charAt(0).toLocaleUpperCase(lang) + name.slice(1);
  } catch { /* old browser: the key */ }
  return key;
}

/** "Cursos" tab of "Seu técnico" (9.3, `.claude/rules/game/courses.md`): languages and coaching licences. */
export function CoursesTab() {
  const { t, i18n } = useTranslation();
  const { session, save, refresh } = useGameSave();
  const leagues = useLeagueCatalog();
  const date = save?.currentDate ?? "";
  const studies = save?.managerStudies;
  const settled = settledStudies(studies, date);
  const spoken = spokenLanguages(save?.manager?.nationalityIso, studies, date);
  const [betWallet, setBetWallet] = useState<number | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!session?.saveId) return;
    fetch(`/api/saves/${session.saveId}/bets?summary=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((v: { wallet: number } | null) => setBetWallet(v?.wallet ?? null))
      .catch(() => setBetWallet(null));
  }, [session?.saveId, save?.managerSpent]);
  const wallet = betWallet ?? managerWallet(save?.managerEarnings ?? 0, save?.managerSpent);
  const languages = useMemo(
    () => languagesOfCountries(leagues.map((l) => l.country)).filter((k) => !spoken.has(k))
      .sort((a, b) => languageName(a, i18n.language, t).localeCompare(languageName(b, i18n.language, t), i18n.language)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [leagues, i18n.language, [...spoken].join("|")],
  );
  const course = settled.course;

  async function buy(kind: CourseKind, language?: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/saves/${session?.saveId}/manager-course`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, ...(language ? { language } : {}) }),
      });
      if (!res.ok) {
        const code = ((await res.json().catch(() => ({}))) as { error?: string }).error;
        setError(t(`courses.errors.${code}`, { defaultValue: t("courses.errors.generic") }));
      }
      setPicked(null);
      await refresh({ background: true });
    } catch {
      setError(t("courses.errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  const courseLabel = (kind: CourseKind, language?: string) =>
    kind === "language" ? t("courses.languageCourse", { language: languageName(language ?? "", i18n.language, t) }) : t(`courses.licence.${kind}`);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card-arcade rounded-md p-4">
          <p className={LABEL}>{t("courses.wallet")}</p>
          <p className="font-display font-bold tabular-nums text-2xl text-primary m-0 mt-1">{formatFee(wallet)}</p>
        </div>
        <div className="card-arcade rounded-md p-4">
          <p className={LABEL}>{t("courses.speaks")}</p>
          <p className="text-sm font-semibold text-foreground m-0 mt-2">
            {[...spoken].map((k) => languageName(k, i18n.language, t)).join(" · ") || "—"}
          </p>
        </div>
        <div className="card-arcade rounded-md p-4">
          <p className={LABEL}>{t("courses.current")}</p>
          <p className="text-sm font-semibold text-foreground m-0 mt-2">
            {course ? t("courses.until", { course: courseLabel(course.kind, course.language), date: formatGameDate(course.until, i18n.language) }) : t("courses.none")}
          </p>
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-destructive m-0">{error}</p>}

      <section className="flex flex-col gap-3">
        <SectionTitle>{t("courses.languagesTitle")}</SectionTitle>
        <p className="text-sm text-muted-foreground tabular-nums m-0">
          {t("courses.languagesNote", { price: formatFee(COURSES.LANGUAGE.price), months: Math.round(COURSES.LANGUAGE.days / 30) })}
        </p>
        {course && (
          <p className="text-sm text-chart-4 tabular-nums m-0">
            {t("courses.oneAtATime", { course: courseLabel(course.kind, course.language), date: formatGameDate(course.until, i18n.language) })}
          </p>
        )}
        {/* Equal columns, so the rows line up (tester report, 9.6.1); a course in progress still lets him pick. */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {languages.map((k) => (
            <Chip key={k} className="w-full justify-center truncate" selected={picked === k} onClick={() => setPicked(picked === k ? null : k)} disabled={busy}>
              {languageName(k, i18n.language, t)}
            </Chip>
          ))}
        </div>
        {picked && (
          <div className="flex flex-wrap items-center gap-2">
            <Button className="tabular-nums" disabled={busy || !!course || wallet < COURSES.LANGUAGE.price} onClick={() => void buy("language", picked)}>
              {t("courses.start", { course: courseLabel("language", picked), price: formatFee(COURSES.LANGUAGE.price) })}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setPicked(null)}>{t("courses.cancel")}</Button>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle>{t("courses.licencesTitle")}</SectionTitle>
        <p className="text-sm text-muted-foreground m-0">
          {t("courses.licencesNote", { points: licenceReputation(studies, date) })}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl">
          {LICENCE_KINDS.map((k) => {
            const c = COURSES.LICENCE[k];
            const has = settled.licences?.includes(k);
            const needsA = k === "pro" && !settled.licences?.includes("a");
            return (
              <div key={k} className="card-arcade rounded-md p-4 flex flex-col gap-2">
                <p className="text-sm font-semibold text-foreground m-0">{t(`courses.licence.${k}`)}</p>
                <p className="text-sm text-muted-foreground m-0">
                  {t("courses.licenceDesc", { points: c.reputation, months: Math.round(c.days / 30) })}
                </p>
                <div className="mt-auto pt-1">
                  {has ? (
                    <p className="text-sm text-primary m-0">{t("courses.done")}</p>
                  ) : (
                    <Button
                      className="tabular-nums"
                      disabled={busy || !!course || needsA || wallet < c.price}
                      title={course ? t("courses.oneAtATime", { course: courseLabel(course.kind, course.language), date: formatGameDate(course.until, i18n.language) }) : needsA ? t("courses.errors.needsA") : wallet < c.price ? t("courses.errors.noMoney") : undefined}
                      onClick={() => void buy(k)}
                    >
                      {formatFee(c.price)}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <p className="text-sm text-muted-foreground m-0">{t("courses.offersNote")}</p>
    </div>
  );
}

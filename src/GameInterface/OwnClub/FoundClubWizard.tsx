import { DialogTitle } from "@headlessui/react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/GameInterface/Components/Modal";
import { ClubLogo } from "@/GameInterface/Components/ClubLogo";
import { Flag } from "@/GameInterface/Components/Flag";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { navigate } from "@/GameInterface/router/navigation";
import { Button } from "@/GameInterface/ui/Button";
import { Label } from "@/GameInterface/ui/Label";
import { Notice } from "@/GameInterface/ui/Notice";
import { TextField } from "@/GameInterface/ui/TextField";
import { useLeagueCatalog } from "@/GameInterface/World/useLeagueCatalog";
import { competitionName, nationalityDisplayName } from "@/Domain/world/labels";
import { nationalityFlagCode } from "@/Domain/world/nationalityFlag";
import { FOUNDED } from "@/Domain/ownClub/ownClubConfig";
import { foundClub, type FoundClubOptions } from "@/GameInterface/OwnClub/ownClubApi";

type Step = "country" | "club" | "identity" | "confirm";
const STEPS: Step[] = ["country", "club", "identity", "confirm"];

const HEX = /^#[0-9a-fA-F]{6}$/;

/** What the founding route accepts (`parseIdentity`, `src/Domain/ownClub/ownClub.ts`); null when valid. */
function identityError(name: string, shortName: string, c1: string, c2: string): "name" | "shortName" | "colors" | null {
  if (name !== name.trim() || name.length < FOUNDED.NAME_MIN || name.length > FOUNDED.NAME_MAX) return "name";
  if (!/^[A-Z]{3}$/.test(shortName)) return "shortName";
  if (!HEX.test(c1) || !HEX.test(c2) || c1.toLowerCase() === c2.toLowerCase()) return "colors";
  return null;
}

/** Three steps (country, club, identity) and a confirmation (`.claude/rules/game/own-club.md`). */
export function FoundClubWizard({ saveId, options, onClose }: { saveId: string; options: FoundClubOptions; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { refresh } = useGameSave();
  const leagues = useLeagueCatalog();
  const [step, setStep] = useState<Step>("country");
  const [country, setCountry] = useState<string | null>(null);
  const [clubId, setClubId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [colors, setColors] = useState<[string, string]>(["#1d4ed8", "#ffffff"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lang = i18n.language;
  const countryName = (n: string) => nationalityDisplayName(n, lang, (key, opts) => t(key, opts));
  const countries = useMemo(
    () => [...options.countries]
      .map((c) => ({ ...c, label: nationalityDisplayName(c.country, lang, (key, opts) => t(key, opts)) }))
      .sort((a, b) => a.label.localeCompare(b.label, lang)),
    [options.countries, lang, t],
  );
  const chosenCountry = options.countries.find((c) => c.country === country) ?? null;
  const chosenClub = chosenCountry?.leagues.flatMap((l) => l.clubs).find((c) => c.id === clubId) ?? null;
  const idError = identityError(name, shortName, colors[0], colors[1]);
  const index = STEPS.indexOf(step);

  const submit = async () => {
    if (!clubId || idError) return;
    setBusy(true);
    setError(null);
    const r = await foundClub(saveId, { squadId: clubId, name, shortName, colors });
    if (!r.ok) {
      setBusy(false);
      setError(r.error);
      return;
    }
    await refresh();
    setBusy(false);
    onClose();
    navigate("/dashboard");
  };

  const row = (selected: boolean, disabled = false) =>
    `w-full flex items-center gap-3 rounded-md border px-3 min-h-10 py-2 text-left text-sm ${
      disabled ? "border-border/60 text-muted-foreground cursor-not-allowed opacity-60"
        : selected ? "border-primary ring-1 ring-primary bg-primary/10 text-foreground cursor-pointer"
        : "border-border bg-card text-foreground cursor-pointer hover:border-primary/50"
    }`;

  const canNext = (step === "country" && !!chosenCountry) || (step === "club" && !!chosenClub) || (step === "identity" && !idError);
  const showIdError = idError !== null && (idError === "colors" || name.length > 0 || shortName.length > 0);

  return (
    <Modal open onClose={onClose} size="lg">
      <div className="flex flex-col max-h-[85vh]">
        <div className="px-6 py-4 border-b border-border">
          <DialogTitle as="h2" className="font-display font-black uppercase text-xl leading-none m-0">
            {t("ownClub.wizard.title")}
          </DialogTitle>
          <p className="text-sm text-muted-foreground m-0 mt-1 tabular-nums">
            {t("ownClub.wizard.stepOf", { n: index + 1, total: STEPS.length })} · {t(`ownClub.wizard.steps.${step}`)}
          </p>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex flex-col gap-3 min-h-0">
          {step === "country" && (
            <>
              <p className="text-sm text-muted-foreground m-0">{t("ownClub.wizard.countryHint")}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {countries.map((c) => {
                  const flag = nationalityFlagCode(c.country);
                  return (
                    <button
                      key={c.country}
                      type="button"
                      aria-pressed={country === c.country}
                      className={row(country === c.country)}
                      onClick={() => { setCountry(c.country); setClubId(null); }}
                    >
                      {flag ? <Flag code={flag} /> : <span className="w-5 shrink-0" />}
                      <span className="truncate">{c.label}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {step === "club" && chosenCountry && (
            <>
              <p className="text-sm text-muted-foreground m-0">{t("ownClub.wizard.clubHint")}</p>
              {chosenCountry.leagues.map((l) => (
                <section key={l.slug} className="flex flex-col gap-2">
                  <Label>{competitionName(l.slug, leagues, lang)}</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {l.clubs.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        disabled={!!c.blocked}
                        aria-pressed={clubId === c.id}
                        className={row(clubId === c.id, !!c.blocked)}
                        onClick={() => setClubId(c.id)}
                      >
                        <span className="truncate flex-1">{c.name}</span>
                        {c.blocked && <span className="text-sm text-muted-foreground shrink-0">{t(`ownClub.wizard.blocked.${c.blocked}`)}</span>}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </>
          )}

          {step === "identity" && (
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-6 items-start">
              <div className="flex flex-col gap-4">
                <TextField
                  id="own-club-name"
                  label={t("ownClub.wizard.name")}
                  variant="box"
                  value={name}
                  maxLength={FOUNDED.NAME_MAX}
                  onChange={(e) => setName(e.target.value)}
                />
                <TextField
                  id="own-club-short"
                  label={t("ownClub.wizard.shortName")}
                  variant="box"
                  value={shortName}
                  maxLength={3}
                  onChange={(e) => setShortName(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3))}
                />
                <div className="flex gap-6">
                  {([0, 1] as const).map((i) => (
                    <div key={i} className="flex flex-col gap-2">
                      <Label htmlFor={`own-club-color-${i}`}>{t(i === 0 ? "ownClub.wizard.color1" : "ownClub.wizard.color2")}</Label>
                      <input
                        id={`own-club-color-${i}`}
                        type="color"
                        value={colors[i]}
                        className="h-10 w-16 rounded border border-border bg-transparent cursor-pointer"
                        onChange={(e) => {
                          const v = e.target.value;
                          setColors((cs) => (i === 0 ? [v, cs[1]] : [cs[0], v]));
                        }}
                      />
                    </div>
                  ))}
                </div>
                {showIdError && idError && (
                  <p className="text-sm text-destructive m-0">{t(`ownClub.wizard.invalid.${idError}`, { min: FOUNDED.NAME_MIN, max: FOUNDED.NAME_MAX })}</p>
                )}
              </div>
              <div className="flex flex-col items-center gap-2">
                <Label>{t("ownClub.wizard.preview")}</Label>
                <ClubLogo primaryColor={colors[0]} secondaryColor={colors[1]} className="w-24 h-24" title={name || undefined} />
                <span className="font-display font-bold uppercase text-base">{shortName || "—"}</span>
              </div>
            </div>
          )}

          {step === "confirm" && chosenClub && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <ClubLogo primaryColor={colors[0]} secondaryColor={colors[1]} className="w-16 h-16" />
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="font-display font-black uppercase text-xl leading-none truncate">{name}</span>
                  <span className="text-sm text-muted-foreground truncate">
                    {t("ownClub.wizard.replaces", { club: chosenClub.name, country: country ? countryName(country) : "" })}
                  </span>
                </div>
              </div>
              <ul className="m-0 pl-5 flex flex-col gap-1.5 text-sm text-foreground">
                <li>{t("ownClub.wizard.confirm.leave")}</li>
                <li>{t("ownClub.wizard.confirm.squad")}</li>
                <li>{t("ownClub.wizard.confirm.players", { count: Object.values(FOUNDED.LINES).reduce((a, b) => a + b, 0) })}</li>
                <li>{t("ownClub.wizard.confirm.president")}</li>
                <li>{t("ownClub.wizard.confirm.once")}</li>
              </ul>
              {error && <Notice kind="error">{t(`ownClub.errors.${error}`, { defaultValue: t("ownClub.errors.generic") })}</Notice>}
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-border flex items-center justify-between gap-3">
          <Button variant="secondary" flush disabled={busy} onClick={() => (index === 0 ? onClose() : setStep(STEPS[index - 1]!))}>
            {t(index === 0 ? "ownClub.wizard.cancel" : "ownClub.wizard.back")}
          </Button>
          {step === "confirm" ? (
            <Button onClick={() => void submit()} disabled={busy || !chosenClub || !!idError}>
              {t(busy ? "ownClub.wizard.founding" : "ownClub.wizard.submit")}
            </Button>
          ) : (
            <Button onClick={() => setStep(STEPS[index + 1]!)} disabled={!canNext}>
              {t("ownClub.wizard.next")}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

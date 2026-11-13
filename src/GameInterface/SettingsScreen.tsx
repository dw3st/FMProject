import { useEffect, useState, type ReactNode } from "react";
import { NavMenuEditor } from "@/GameInterface/Components/NavMenuEditor";
import { useTranslation } from "react-i18next";
import { useLanguage } from "@/i18n/LanguageProvider";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/i18n/i18n";
import { fetchCurrentUser, logout, type CurrentUser } from "@/GameInterface/AuthGate";
import { Icon, type IconName } from "@/GameInterface/Icons";
import { Flag } from "@/GameInterface/Components/Flag";
import { Button } from "@/GameInterface/ui/Button";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { SegmentedTabs } from "@/GameInterface/ui/SegmentedTabs";
import { AppInstallBlock } from "@/GameInterface/pwa/AppInstallBlock";
import { readMatchSound, writeMatchSound, readMatchVolume, writeMatchVolume, readReadySound, writeReadySound, readChatSound, writeChatSound } from "@/GameInterface/artPrefs";
import { playChatSound, playReadySound } from "@/GameInterface/readySound";
import { disableTurnNotification, enableTurnNotification, readTurnNotification, turnNotificationSupported } from "@/GameInterface/World/turnNotice";
import { readGoalReplay, readMatchCamera, readMatchInFrame, writeMatchInFrame, readNewVisual, readQuality, writeGoalReplay, writeMatchCamera, writeNewVisual, writeQuality, type QualityPref, readPlayerLook, writePlayerLook, type PlayerLookPref } from "@/GameInterface/artPrefs";

interface SettingsOverlayProps {
  open: boolean;
  onClose: () => void;
  /** When provided, shows a "Main Menu" action that returns to the save-selection screen. */
  onExitToMenu?: () => void;
}

type SectionKey = "general" | "match" | "graphics" | "sound" | "menu";

const SECTIONS: { key: SectionKey; icon: IconName }[] = [
  { key: "general", icon: "settings" },
  { key: "match", icon: "ball" },
  { key: "graphics", icon: "image" },
  { key: "sound", icon: "volume" },
  { key: "menu", icon: "grid" },
];

const SECTION_STORAGE_KEY = "fm.settings.section";

/** The section last opened in this browser tab; "general" without storage. */
function readSection(): SectionKey {
  try {
    const raw = window.sessionStorage.getItem(SECTION_STORAGE_KEY);
    const found = SECTIONS.find((s) => s.key === raw);
    if (found) return found.key;
  } catch { /* no storage: the first section */ }
  return "general";
}

function writeSection(key: SectionKey): void {
  try { window.sessionStorage.setItem(SECTION_STORAGE_KEY, key); } catch { /* works without storage */ }
}

const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground";
const GRID = "grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-2";

/** One setting: label, control, one line of description. */
function Block({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className={LABEL}>{label}</div>
      {children}
    </div>
  );
}

/**
 * Settings (11.2): a wide window with the sections listed on the left (a tab row on top below `lg` and on a phone)
 * and the chosen section on the right. Every control applies at once; Save only closes.
 */
export function SettingsOverlay({ open, onClose, onExitToMenu }: SettingsOverlayProps) {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  const [section, setSection] = useState<SectionKey>(readSection);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [newVisual, setNewVisual] = useState(readNewVisual);
  const [matchCamera, setMatchCamera] = useState(readMatchCamera);
  const [goalReplay, setGoalReplay] = useState(readGoalReplay);
  const [matchInFrame, setMatchInFrame] = useState(readMatchInFrame);
  const [matchSound, setMatchSound] = useState(readMatchSound);
  const [readySound, setReadySound] = useState(readReadySound);
  const [chatSound, setChatSound] = useState(readChatSound);
  const [turnNotification, setTurnNotification] = useState(readTurnNotification);
  const [turnBlocked, setTurnBlocked] = useState(false);
  const [matchVolume, setMatchVolume] = useState(readMatchVolume);
  const [quality, setQuality] = useState<QualityPref>(readQuality);
  const [playerLook, setPlayerLook] = useState<PlayerLookPref>(readPlayerLook);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    fetchCurrentUser().then(setUser);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const onOff = [{ key: "on", label: t("settings.newVisualOn") }, { key: "off", label: t("settings.newVisualOff") }];
  const openSection = (key: SectionKey) => { setSection(key); writeSection(key); };

  return (
    <div className="fixed inset-0 z-[200] bg-background flex flex-col">
      <div className="shrink-0 border-b border-border">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-4 px-6 phone:h-12 phone:px-3">
          <h1 className="font-display font-black uppercase tracking-tight text-3xl md:text-4xl leading-none m-0 phone:text-2xl">
            {t("settings.title")}
          </h1>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="w-10 h-10 shrink-0 bg-transparent border-0 text-muted-foreground hover:text-foreground flex items-center justify-center cursor-pointer"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-5 px-6 py-6 lg:flex-row lg:gap-8 phone:flex-col phone:gap-3 phone:px-3 phone:py-3">
          {/* Sections: a column on a wide screen, a tab row below `lg` and on a phone. */}
          <nav aria-label={t("settings.title")} className="hidden w-52 shrink-0 flex-col gap-1 lg:flex phone:hidden">
            {SECTIONS.map((s) => {
              const on = s.key === section;
              return (
                <button
                  key={s.key}
                  type="button"
                  aria-current={on ? "page" : undefined}
                  onClick={() => openSection(s.key)}
                  className={`flex h-10 w-full shrink-0 cursor-pointer items-center gap-3 border-l-2 pl-4 pr-3 text-left font-display font-bold uppercase tracking-[0.08em] text-sm transition-colors ${
                    on ? "border-primary bg-card text-foreground" : "border-transparent bg-transparent text-muted-foreground hover:bg-secondary/30 hover:text-foreground"
                  }`}
                >
                  <Icon name={s.icon} size={16} className={on ? "text-primary" : ""} />
                  <span className="min-w-0 truncate">{t(`settings.sections.${s.key}`)}</span>
                </button>
              );
            })}
          </nav>
          <SegmentedTabs<SectionKey>
            wrap
            compact
            className="shrink-0 lg:hidden phone:flex"
            aria-label={t("settings.title")}
            active={section}
            onChange={openSection}
            tabs={SECTIONS.map((s) => ({
              key: s.key,
              label: <><Icon name={s.icon} size={16} />{t(`settings.sections.${s.key}`)}</>,
            }))}
          />

          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-y-auto pr-1">
            <h2 className="font-display font-black uppercase text-xl leading-none m-0 phone:hidden">
              {t(`settings.sections.${section}`)}
            </h2>

            {section === "general" && (
              <div className={GRID}>
                <Block label={t("settings.language")} className="lg:col-span-2">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <LanguageOption
                        key={lang.code}
                        code={lang.code}
                        label={lang.label}
                        flag={lang.flag}
                        selected={language === lang.code}
                        onSelect={() => setLanguage(lang.code)}
                      />
                    ))}
                  </div>
                  <p className="m-0 text-sm text-muted-foreground">{t("settings.languageDescription")}</p>
                </Block>

                <AppInstallBlock />

                {turnNotificationSupported() && (
                  <Block label={t("settings.turnNotification")}>
                    <OptionChips
                      value={turnNotification ? "on" : "off"}
                      onChange={(k) => {
                        if (k === "off") {
                          disableTurnNotification();
                          setTurnNotification(false);
                          setTurnBlocked(false);
                          return;
                        }
                        void enableTurnNotification().then((on) => {
                          setTurnNotification(on);
                          setTurnBlocked(!on);
                        });
                      }}
                      options={onOff}
                    />
                    <p className={`m-0 text-sm ${turnBlocked ? "text-destructive" : "text-muted-foreground"}`}>
                      {t(turnBlocked ? "settings.turnNotificationBlocked" : "settings.turnNotificationDescription")}
                    </p>
                  </Block>
                )}

                {(onExitToMenu || user) && (
                  <div className={`${GRID} border-t border-border pt-6 lg:col-span-2`}>
                    {onExitToMenu && (
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={onExitToMenu}
                          className="w-full h-10 flex items-center justify-center gap-2 rounded border border-border bg-transparent text-sm font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          <Icon name="home" size={16} />
                          {t("settings.mainMenu")}
                        </button>
                        <p className="m-0 text-sm text-muted-foreground">{t("settings.mainMenuDescription")}</p>
                      </div>
                    )}
                    {user && (
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className={LABEL}>{t("common.signedInAs")}</div>
                          <div className="text-sm font-medium text-foreground truncate">{user.email}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => { void logout(); }}
                          className="flex shrink-0 items-center gap-2 h-10 px-4 rounded bg-transparent border-0 text-sm text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          <Icon name="log-out" size={16} />
                          {t("common.signOut")}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {section === "match" && (
              <div className={GRID}>
                <Block label={t("settings.matchCamera")}>
                  <OptionChips
                    value={matchCamera}
                    onChange={(k) => { const v = k === "follow" ? "follow" : "fixed"; setMatchCamera(v); writeMatchCamera(v); }}
                    options={[{ key: "fixed", label: t("settings.matchCameraFixed") }, { key: "follow", label: t("settings.matchCameraFollow") }]}
                  />
                </Block>

                <Block label={t("settings.goalReplay")}>
                  <OptionChips
                    value={goalReplay ? "on" : "off"}
                    onChange={(k) => { const on = k === "on"; setGoalReplay(on); writeGoalReplay(on); }}
                    options={onOff}
                  />
                  <p className="m-0 text-sm text-muted-foreground">{t("settings.goalReplayDescription")}</p>
                </Block>

                <Block label={t("settings.matchInFrame")}>
                  <OptionChips
                    value={matchInFrame ? "on" : "off"}
                    onChange={(k) => { const on = k === "on"; setMatchInFrame(on); writeMatchInFrame(on); }}
                    options={onOff}
                  />
                  <p className="m-0 text-sm text-muted-foreground">{t("settings.matchInFrameDescription")}</p>
                </Block>
              </div>
            )}

            {section === "graphics" && (
              <div className={GRID}>
                <Block label={t("settings.newVisual")}>
                  <OptionChips
                    value={newVisual ? "on" : "off"}
                    onChange={(k) => { const on = k === "on"; setNewVisual(on); writeNewVisual(on); }}
                    options={onOff}
                  />
                  <p className="m-0 text-sm text-muted-foreground">{t("settings.newVisualDescription")}</p>
                </Block>

                <Block label={t("settings.quality")}>
                  <OptionChips
                    value={quality}
                    onChange={(k) => { const v = k === "high" || k === "light" ? k : "auto"; setQuality(v); writeQuality(v); }}
                    options={[{ key: "auto", label: t("settings.qualityAuto") }, { key: "high", label: t("settings.qualityHigh") }, { key: "light", label: t("settings.qualityLight") }]}
                  />
                  <p className="m-0 text-sm text-muted-foreground">{t("settings.qualityDescription")}</p>
                </Block>

                <Block label={t("settings.playerLook")}>
                  <OptionChips
                    value={playerLook}
                    onChange={(k) => { const v = k === "real" ? "real" : "current"; setPlayerLook(v); writePlayerLook(v); }}
                    options={[{ key: "current", label: t("settings.playerLookCurrent") }, { key: "real", label: t("settings.playerLookReal") }]}
                  />
                  <p className="m-0 text-sm text-muted-foreground">{t("settings.playerLookDescription")}</p>
                </Block>
              </div>
            )}

            {section === "sound" && (
              <div className={GRID}>
                <Block label={t("settings.matchSound")}>
                  <OptionChips
                    value={matchSound ? "on" : "off"}
                    onChange={(k) => { const on = k === "on"; setMatchSound(on); writeMatchSound(on); }}
                    options={onOff}
                  />
                  <label className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px]">{t("settings.matchVolume")}</span>
                    <input
                      type="range" min={0} max={100} step={5}
                      value={Math.round(matchVolume * 100)}
                      onChange={(e) => { const v = Number(e.target.value) / 100; setMatchVolume(v); writeMatchVolume(v); }}
                      className="flex-1 accent-primary"
                    />
                    <span className="tabular-nums w-10 text-right">{Math.round(matchVolume * 100)}%</span>
                  </label>
                  <p className="m-0 text-sm text-muted-foreground">{t("settings.matchSoundDescription")}</p>
                </Block>

                <Block label={t("settings.readySound")}>
                  <OptionChips
                    value={readySound ? "on" : "off"}
                    onChange={(k) => {
                      const on = k === "on";
                      setReadySound(on);
                      writeReadySound(on);
                      if (on) playReadySound();
                    }}
                    options={onOff}
                  />
                  <p className="m-0 text-sm text-muted-foreground">{t("settings.readySoundDescription")}</p>
                </Block>

                <Block label={t("settings.chatSound")}>
                  <OptionChips
                    value={chatSound ? "on" : "off"}
                    onChange={(k) => {
                      const on = k === "on";
                      setChatSound(on);
                      writeChatSound(on);
                      if (on) playChatSound(true);
                    }}
                    options={onOff}
                  />
                  <p className="m-0 text-sm text-muted-foreground">{t("settings.chatSoundDescription")}</p>
                </Block>
              </div>
            )}

            {section === "menu" && <NavMenuEditor />}
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-border">
        <div className="mx-auto flex w-full max-w-5xl justify-end px-6 py-4 phone:px-3 phone:py-2">
          <Button onClick={onClose}>{t("common.save")}</Button>
        </div>
      </div>
    </div>
  );
}

interface LanguageOptionProps {
  code: SupportedLanguage;
  label: string;
  flag: string;
  selected: boolean;
  onSelect: () => void;
}

function LanguageOption({ label, flag, selected, onSelect }: LanguageOptionProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full flex items-center justify-between gap-3 p-3 rounded-md border text-left cursor-pointer ${
        selected
          ? "border-primary ring-1 ring-primary bg-card"
          : "border-border bg-card hover:border-primary/50"
      }`}
    >
      <div className="flex items-center gap-3">
        <Flag code={flag} className="w-8 h-6" />
        <span className={`text-base font-semibold ${selected ? "text-foreground" : "text-muted-foreground"}`}>
          {label}
        </span>
      </div>
      {selected && <Icon name="check" size={16} className="text-primary" />}
    </button>
  );
}

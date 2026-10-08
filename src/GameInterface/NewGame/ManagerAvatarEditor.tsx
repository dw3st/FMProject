import { useTranslation } from "react-i18next";
import { FaceImage } from "@/GameInterface/Components/PlayerFace";
import { Button } from "@/GameInterface/ui/Button";
import { Label } from "@/GameInterface/ui/Label";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { Icon } from "@/GameInterface/Icons";
import { managerAvatarUrl } from "@/Domain/faces/faceUrl";
import {
  BEARD_KEYS,
  HAIR_COLOR_KEYS,
  HAIR_LENGTH_KEYS,
  SKIN_TONES,
  randomFaceSeed,
  type ManagerFace,
} from "@/Domain/faces/managerFace";
import { HAIR_COLORS, SKIN_COLORS } from "@/Domain/faces/faceTraits";

const AUTO = "auto";

/** Colour dot inside a chip; the colour is data (a skin / hair tone), hence the inline style. */
function Swatch({ color }: { color: string }) {
  return <span aria-hidden="true" className="inline-block w-4 h-4 rounded-full border border-border" style={{ background: color }} />;
}

/**
 * New-game avatar of the manager (Etapa 31b): a server-rendered preview (`<img>`, facesjs stays on
 * the server) and chips for skin, hair colour and length, beard and glasses. "Sortear" draws another
 * face and puts every choice back to drawn.
 */
export function ManagerAvatarEditor({
  face, nationality, initials, onChange,
}: {
  face: ManagerFace;
  /** Country name for the face region (`managerFaceCountry`). */
  nationality: string | null;
  initials: string;
  onChange: (next: ManagerFace) => void;
}) {
  const { t } = useTranslation();
  const set = <K extends keyof ManagerFace>(key: K, value: ManagerFace[K] | undefined) => {
    const next = { ...face };
    if (value === undefined) delete next[key];
    else next[key] = value;
    onChange(next);
  };
  const autoChip = { key: AUTO, label: t("newGame.avatar.auto") };

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
      <div className="flex flex-col items-center gap-3 shrink-0">
        <FaceImage src={managerAvatarUrl(face, nationality)} size={128} fallback={initials} />
        <Button variant="secondary" flush onClick={() => onChange({ seed: randomFaceSeed() })}>
          <Icon name="shuffle" size={16} />
          {t("newGame.avatar.shuffle")}
        </Button>
      </div>

      <div className="flex flex-col gap-3 min-w-0">
        <div>
          <Label className="mb-2">{t("newGame.avatar.skin")}</Label>
          <OptionChips
            aria-label={t("newGame.avatar.skin")}
            value={face.skin ? String(face.skin) : AUTO}
            onChange={(k) => set("skin", k === AUTO ? undefined : (Number(k) as ManagerFace["skin"]))}
            options={[autoChip, ...SKIN_TONES.map((s) => ({
              key: String(s),
              title: t("newGame.avatar.skinTone", { n: s }),
              label: <><Swatch color={SKIN_COLORS[s]} /><span className="sr-only">{t("newGame.avatar.skinTone", { n: s })}</span></>,
            }))]}
          />
        </div>
        <div>
          <Label className="mb-2">{t("newGame.avatar.hairColor")}</Label>
          <OptionChips
            aria-label={t("newGame.avatar.hairColor")}
            value={face.hairColor ?? AUTO}
            onChange={(k) => set("hairColor", k === AUTO ? undefined : (k as ManagerFace["hairColor"]))}
            options={[autoChip, ...HAIR_COLOR_KEYS.map((c) => ({
              key: c,
              label: <><Swatch color={HAIR_COLORS[c]} />{t(`newGame.avatar.hairColors.${c}`)}</>,
            }))]}
          />
        </div>
        <div>
          <Label className="mb-2">{t("newGame.avatar.hairLength")}</Label>
          <OptionChips
            aria-label={t("newGame.avatar.hairLength")}
            value={face.hairLength ?? AUTO}
            onChange={(k) => set("hairLength", k === AUTO ? undefined : (k as ManagerFace["hairLength"]))}
            options={[autoChip, ...HAIR_LENGTH_KEYS.map((l) => ({ key: l, label: t(`newGame.avatar.hairLengths.${l}`) }))]}
          />
        </div>
        <div>
          <Label className="mb-2">{t("newGame.avatar.beard")}</Label>
          <OptionChips
            aria-label={t("newGame.avatar.beard")}
            value={face.beard ?? AUTO}
            onChange={(k) => set("beard", k === AUTO ? undefined : (k as ManagerFace["beard"]))}
            options={[autoChip, ...BEARD_KEYS.map((b) => ({ key: b, label: t(`newGame.avatar.beards.${b}`) }))]}
          />
        </div>
        <div>
          <Label className="mb-2">{t("newGame.avatar.glasses")}</Label>
          <OptionChips
            aria-label={t("newGame.avatar.glasses")}
            value={face.glasses === undefined ? AUTO : face.glasses ? "yes" : "no"}
            onChange={(k) => set("glasses", k === AUTO ? undefined : k === "yes")}
            options={[
              autoChip,
              { key: "no", label: t("newGame.avatar.glassesNo") },
              { key: "yes", label: t("newGame.avatar.glassesYes") },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

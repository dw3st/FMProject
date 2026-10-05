import { useTranslation } from "react-i18next";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { variantsForRole } from "@/GameEngine/Configs/RoleVariantConfig";
import type { PressLevel, RoleVariantId, SlotInstruction } from "@/types/tacticsTypes";

const PRESS_LEVELS: PressLevel[] = ["less", "normal", "more"];

/**
 * Role variant + individual pressing chips of one slot (player instructions,
 * `.claude/rules/game/player-instructions.md`). Dumb: the parent saves the change. Used by the
 * Formation screen, the live substitution panel and `/test`.
 */
export function SlotInstructionChips({
  role, instruction, onChange, disabled,
}: {
  role: string;
  instruction: SlotInstruction | null | undefined;
  onChange: (next: SlotInstruction | null) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  if (role === "GK") return <p className="text-sm text-muted-foreground m-0">{t("instructions.noGoalkeeper")}</p>;
  const variants = variantsForRole(role);
  const variant = instruction?.variant ?? "default";
  const press = instruction?.press ?? "normal";
  const emit = (v: RoleVariantId | "default", p: PressLevel) => {
    const next: SlotInstruction = {};
    if (v !== "default") next.variant = v;
    if (p !== "normal") next.press = p;
    onChange(next.variant || next.press ? next : null);
  };
  return (
    <div className="flex flex-col gap-3">
      {variants.length > 0 && (
        <div>
          <p className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0 mb-1.5">
            {t("instructions.role")}
          </p>
          <OptionChips<RoleVariantId | "default">
            aria-label={t("instructions.role")}
            disabled={disabled}
            options={[
              { key: "default", label: t("instructions.default") },
              ...variants.map((v) => ({ key: v, label: t(`instructions.variant.${v}.name`) })),
            ]}
            value={variant}
            onChange={(v) => emit(v, press)}
          />
          <p className="text-sm text-muted-foreground m-0 mt-1.5">
            {variant === "default" ? t("instructions.defaultDesc") : t(`instructions.variant.${variant}.desc`)}
          </p>
        </div>
      )}
      <div>
        <p className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0 mb-1.5">
          {t("instructions.pressLabel")}
        </p>
        <OptionChips<PressLevel>
          aria-label={t("instructions.pressLabel")}
          disabled={disabled}
          options={PRESS_LEVELS.map((p) => ({ key: p, label: t(`instructions.press.${p}`) }))}
          value={press}
          onChange={(p) => emit(variant, p)}
        />
      </div>
    </div>
  );
}

/** Short tag of a slot's role variant for pitch markers ("INV", "F9"); undefined = default. */
export function useInstructionShort(): (instr: SlotInstruction | null | undefined) => string | undefined {
  const { t } = useTranslation();
  return (instr) => (instr?.variant ? t(`instructions.variant.${instr.variant}.short`) : undefined);
}

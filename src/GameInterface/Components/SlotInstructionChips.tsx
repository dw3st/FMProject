import { useTranslation } from "react-i18next";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { PLAYER_LEVEL_KEYS, oopRolesForRole, variantsForRole } from "@/GameEngine/Configs/RoleVariantConfig";
import type { Duty, InstructionLevel, OopRoleId, PressLevel, RoleVariantId, SlotInstruction } from "@/types/tacticsTypes";
import { INSTRUCTION_LEVELS } from "@/Domain/tactics/teamInstructions";
import { useLevelLabels } from "@/GameInterface/Tactics/TeamInstructionsPanel";

const DUTIES: Duty[] = ["defend", "support", "attack"];

/** Drops the default fields of a slot instruction (null = nothing set). */
function clean(i: SlotInstruction): SlotInstruction | null {
  const out: SlotInstruction = { ...i };
  if (out.press === "normal") delete out.press;
  if (out.duty === "support") delete out.duty;
  for (const k of Object.keys(out) as (keyof SlotInstruction)[]) if (out[k] === undefined) delete out[k];
  return Object.keys(out).length > 0 ? out : null;
}

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
  // Every hook before the goalkeeper's early return: switching slots must not change the hook count.
  const labels = useLevelLabels();
  if (role === "GK") return <p className="text-sm text-muted-foreground m-0">{t("instructions.noGoalkeeper")}</p>;
  const variants = variantsForRole(role);
  const variant = instruction?.variant ?? "default";
  const press = instruction?.press ?? "normal";
  const set = (patch: Partial<SlotInstruction>) => onChange(clean({ ...(instruction ?? {}), ...patch }));
  const emit = (v: RoleVariantId | "default", p: PressLevel) => set({ variant: v === "default" ? undefined : v, press: p });
  const oops = oopRolesForRole(role);
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
      <div>
        <p className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0 mb-1.5">
          {t("instructions.dutyLabel")}
        </p>
        <OptionChips<Duty>
          aria-label={t("instructions.dutyLabel")}
          disabled={disabled}
          options={DUTIES.map((d) => ({ key: d, label: t(`instructions.duty.${d}`) }))}
          value={instruction?.duty ?? "support"}
          onChange={(d) => set({ duty: d })}
        />
      </div>
      {oops.length > 0 && (
        <div>
          <p className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0 mb-1.5">
            {t("instructions.oopLabel")}
          </p>
          <OptionChips<OopRoleId | "default">
            aria-label={t("instructions.oopLabel")}
            disabled={disabled}
            options={[
              { key: "default", label: t("instructions.default") },
              ...oops.map((o) => ({ key: o, label: t(`instructions.oop.${o}.name`) })),
            ]}
            value={instruction?.oop ?? "default"}
            onChange={(o) => set({ oop: o === "default" ? undefined : o })}
          />
          <p className="text-sm text-muted-foreground m-0 mt-1.5">
            {instruction?.oop ? t(`instructions.oop.${instruction.oop}.desc`) : t("instructions.oopDefaultDesc")}
          </p>
        </div>
      )}
      {PLAYER_LEVEL_KEYS.map((k) => {
        const l = labels(k);
        return (
          <div key={k}>
            <p className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0 mb-1.5">
              {t(`tactics.instr.labels.${k}`)}
            </p>
            <OptionChips<string>
              aria-label={t(`tactics.instr.labels.${k}`)}
              disabled={disabled}
              options={[
                { key: "team", label: t("instructions.teamLevel") },
                ...INSTRUCTION_LEVELS.map((lv, i) => ({ key: String(lv), label: l[i] ?? String(lv) })),
              ]}
              value={instruction?.[k] === undefined ? "team" : String(instruction[k])}
              onChange={(v) => set({ [k]: v === "team" ? undefined : (Number(v) as InstructionLevel) })}
            />
          </div>
        );
      })}
    </div>
  );
}

/** Short tag of a slot's role variant for pitch markers ("INV", "F9"); undefined = default. */
export function useInstructionShort(): (instr: SlotInstruction | null | undefined) => string | undefined {
  const { t } = useTranslation();
  return (instr) => (instr?.variant ? t(`instructions.variant.${instr.variant}.short`) : undefined);
}

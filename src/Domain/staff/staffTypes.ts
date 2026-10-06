export const STAFF_ROLES = ["assistant", "fitness", "scout"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export interface StaffMember {
  id: string;
  name: string;
  nationality: string;
  role: StaffRole;
  /** 1..10 */
  rating: number;
  age: number;
  /** Weekly wage (€) at the moment of hiring/generation, already scaled by the club factor. */
  wage: number;
}

export type StaffRecord = Partial<Record<StaffRole, StaffMember>> & {
  /** Field scouts (`.claude/rules/game/scouting.md`), up to `SCOUTING.MAX_FIELD_SCOUTS`; each leads one mission. */
  scouts?: StaffMember[];
};

export function isStaffRole(v: unknown): v is StaffRole {
  return typeof v === "string" && (STAFF_ROLES as readonly string[]).includes(v);
}

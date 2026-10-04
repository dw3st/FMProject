/** Main roles (GK / Defender / Midfielder / Forward) and the mapping from detailed positions. */

export type MainRole = "GK" | "Defender" | "Midfielder" | "Forward";

/** Map every detailed position code to its main role. */
const MAIN_ROLE_MAP: Record<string, MainRole> = {
  // Main roles pass through unchanged
  GK: "GK", Defender: "Defender", Midfielder: "Midfielder", Forward: "Forward",
  // Detailed roles
  CB:  "Defender", LB: "Defender", RB: "Defender", LWB: "Defender", RWB: "Defender",
  CDM: "Midfielder", DM: "Midfielder", CM: "Midfielder", CAM: "Midfielder",
  AM:  "Midfielder", LM: "Midfielder", RM: "Midfielder",
  LW:  "Forward", RW: "Forward", ST: "Forward", CF: "Forward",
};

/** Returns the main role for a position code (main or detailed). Falls back to "Forward". */
export function getMainRole(pos: string): MainRole {
  return MAIN_ROLE_MAP[pos] ?? "Forward";
}

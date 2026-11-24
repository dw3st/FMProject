/** Club partnerships (report 648035a3): the human club's satellite and parent club. */
export type PartnershipKind = "satellite" | "parent";

export interface Partnership {
  clubId: string;
  clubName: string;
  /** Day signed. */
  since: string;
  /** The parent's loan offers to the human satellite in the current window (`window` = its last day). */
  offers?: { window: string; count: number; lastWeek?: string };
  /** The parent's loan offer waiting for an answer (one at a time). */
  pending?: ParentLoanOffer;
}

/** A young player the parent club offers to lend to the human satellite: no fee, it pays `wageShare` of the wage. */
export interface ParentLoanOffer {
  id: string;
  playerId: string;
  playerName: string;
  wageShare: number;
  until: string;
  expires: string;
}

export interface SeatPartnerships {
  satellite?: Partnership;
  parent?: Partnership;
}

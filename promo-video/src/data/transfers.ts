// Plausible transfer rows for Scene 4. Uses real player IDs and clubs
// from the TouchLines dataset where possible.

export type TransferStatus = "accepted" | "pending" | "negotiating" | "rejected";

export interface PromoTransfer {
  playerName: string;
  position: string;        // "FWD" / "MID" / "DEF" / "GK"
  age: number;
  from: string;
  to: string;
  fee: string;             // formatted, e.g. "€58M"
  status: TransferStatus;
  isUserClub: boolean;     // true if Real Madrid is involved
}

export const WORLD_TRANSFERS: PromoTransfer[] = [
  {
    playerName: "Florian Wirtz",
    position: "MID",
    age: 24,
    from: "Manchester City",
    to: "Real Madrid",
    fee: "€92M",
    status: "negotiating",
    isUserClub: true,
  },
  {
    playerName: "Dayot Upamecano",
    position: "DEF",
    age: 28,
    from: "Bayern München",
    to: "Real Madrid",
    fee: "€58M",
    status: "accepted",
    isUserClub: true,
  },
  {
    playerName: "Dani Ceballos",
    position: "MID",
    age: 29,
    from: "Real Madrid",
    to: "Arsenal",
    fee: "€22M",
    status: "pending",
    isUserClub: true,
  },
  {
    playerName: "João Pedro",
    position: "FWD",
    age: 24,
    from: "Brighton",
    to: "Liverpool",
    fee: "€48M",
    status: "accepted",
    isUserClub: false,
  },
  {
    playerName: "Désiré Doué",
    position: "MID",
    age: 22,
    from: "Paris SG",
    to: "Bayern München",
    fee: "€71M",
    status: "negotiating",
    isUserClub: false,
  },
  {
    playerName: "Endrick",
    position: "FWD",
    age: 21,
    from: "Real Madrid",
    to: "AC Milan",
    fee: "€35M",
    status: "rejected",
    isUserClub: true,
  },
];

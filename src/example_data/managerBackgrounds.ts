export type ManagerBackgroundIcon =
  | "trophy"
  | "sparkles"
  | "globe"
  | "heart"
  | "chart";

export interface ManagerBackground {
  id:          string;
  name:        string;
  description: string;
  icon:        ManagerBackgroundIcon;
  bonuses:     string[];
}

export const MANAGER_BACKGROUNDS: ManagerBackground[] = [
  {
    id: "former-player",
    name: "Former Player",
    description:
      "A celebrated career on the pitch has given you tactical insight and respect from players. You know the game from the inside.",
    icon: "trophy",
    bonuses: ["High initial reputation", "Better player relationships", "Tactical knowledge"],
  },
  {
    id: "young-prodigy",
    name: "Young Prodigy",
    description:
      "Fresh out of coaching school with modern ideas and innovative tactics. You have everything to prove.",
    icon: "sparkles",
    bonuses: ["Modern training methods", "Youth development bonus", "Faster learning"],
  },
  {
    id: "journeyman",
    name: "Journeyman Manager",
    description:
      "Years of experience across multiple clubs and divisions. You've seen it all and adapted to every situation.",
    icon: "globe",
    bonuses: ["Versatile tactics", "Experience in adversity", "Financial management"],
  },
  {
    id: "club-legend",
    name: "Club Legend",
    description:
      "You rose through the ranks at your beloved club, from youth team to first team coach. This is your destiny.",
    icon: "heart",
    bonuses: ["Maximum board trust", "Fan support", "Club knowledge"],
  },
  {
    id: "analyst",
    name: "Data Analyst",
    description:
      "Numbers don't lie. Your analytical approach to the game has revolutionized how you build and manage teams.",
    icon: "chart",
    bonuses: ["Advanced scouting", "Statistical insights", "Transfer market advantage"],
  },
];

export const MANAGER_NATIONALITIES: { id: string; name: string; flag: string }[] = [
  { id: "br", name: "Brazilian",     flag: "br" },
  { id: "pt", name: "Portuguese",    flag: "pt" },
  { id: "es", name: "Spanish",       flag: "es" },
  { id: "it", name: "Italian",       flag: "it" },
  { id: "de", name: "German",        flag: "de" },
  { id: "fr", name: "French",        flag: "fr" },
  { id: "gb", name: "English",       flag: "gb-eng" },
  { id: "ar", name: "Argentinian",   flag: "ar" },
  { id: "nl", name: "Dutch",         flag: "nl" },
  { id: "us", name: "American",      flag: "us" },
];

import type { Confed, NationGroup } from "@/types/registrationTypes";

/**
 * Nationality spellings that differ from the country names of the world (`countries.json`): without them every
 * player of Türkiye, the USA and Czechia would be "foreign" in his own league.
 */
export const NATION_ALIAS: Record<string, string> = {
  Czechia: "Czech Republic",
  "United States": "USA",
  "Türkiye": "Turkey",
};

/** The nation of a nationality as the registration rules read it; null/empty = unknown. */
export function normalizeNation(n: string | null | undefined): string | null {
  if (!n) return null;
  return NATION_ALIAS[n] ?? n;
}

const UEFA = [
  "Albania", "Andorra", "Armenia", "Austria", "Azerbaijan", "Belarus", "Belgium", "Bosnia & Herzegovina", "Bulgaria",
  "Croatia", "Cyprus", "Czech Republic", "Denmark", "England", "Estonia", "Faroe Islands", "Finland", "France", "Georgia",
  "Germany", "Greece", "Hungary", "Iceland", "Ireland", "Israel", "Italy", "Kazakhstan", "Kosovo", "Latvia",
  "Liechtenstein", "Lithuania", "Luxembourg", "Malta", "Moldova", "Montenegro", "Netherlands", "North Macedonia",
  "Northern Ireland", "Norway", "Poland", "Portugal", "Romania", "Russia", "San Marino", "Scotland", "Serbia",
  "Slovakia", "Slovenia", "Spain", "Sweden", "Switzerland", "Turkey", "Ukraine", "Wales",
];
const CONMEBOL = ["Argentina", "Bolivia", "Brazil", "Chile", "Colombia", "Ecuador", "Paraguay", "Peru", "Uruguay", "Venezuela"];
const CONCACAF = [
  "Barbados", "Canada", "Cayman Islands", "Costa Rica", "Cuba", "Curaçao", "Dominican Republic", "El Salvador",
  "French Guiana", "Guadeloupe", "Guatemala", "Guyana", "Haiti", "Honduras", "Jamaica", "Martinique", "Mexico", "Panama",
  "Puerto Rico", "St. Kitts & Nevis", "St. Vincent & Grenadines", "Suriname", "Trinidad & Tobago", "USA", "Nicaragua",
];
const CAF = [
  "Algeria", "Angola", "Benin", "Botswana", "Burkina Faso", "Burundi", "Cameroon", "Cape Verde", "Central African Republic",
  "Chad", "Comoros", "Congo - Brazzaville", "Côte d’Ivoire", "DR Congo", "Egypt", "Equatorial Guinea", "Eritrea",
  "Eswatini", "Ethiopia", "Gabon", "Gambia", "Ghana", "Guinea", "Guinea-Bissau", "Kenya", "Liberia", "Libya",
  "Madagascar", "Mali", "Mauritania", "Morocco", "Mozambique", "Namibia", "Niger", "Nigeria", "Rwanda", "Senegal",
  "Seychelles", "Sierra Leone", "Somalia", "South Africa", "Sudan", "Tanzania", "Togo", "Tunisia", "Uganda", "Zambia",
  "Zimbabwe",
];
const AFC = [
  "Afghanistan", "Australia", "Bahrain", "Bangladesh", "China", "Indonesia", "Iran", "Iraq", "Japan", "Jordan",
  "Kyrgyzstan", "Lebanon", "Malaysia", "Oman", "Pakistan", "Palestinian Territories", "Philippines", "Qatar",
  "Saudi Arabia", "Singapore", "South Korea", "Sri Lanka", "Syria", "Tajikistan", "Thailand", "Turkmenistan",
  "United Arab Emirates", "Uzbekistan", "Yemen",
];
const OFC = ["Fiji", "New Caledonia", "New Zealand", "Solomon Islands", "Vanuatu"];

/** Confederation of every nationality of the world (tested against the squads). */
export const NATION_CONFED: Record<string, Confed> = Object.fromEntries([
  ...UEFA.map((n) => [n, "UEFA"]),
  ...CONMEBOL.map((n) => [n, "CONMEBOL"]),
  ...CONCACAF.map((n) => [n, "CONCACAF"]),
  ...CAF.map((n) => [n, "CAF"]),
  ...AFC.map((n) => [n, "AFC"]),
  ...OFC.map((n) => [n, "OFC"]),
]) as Record<string, Confed>;

/** EU + EEA (Iceland, Norway, Liechtenstein). Switzerland and the UK are not. */
export const EU = new Set([
  "Austria", "Belgium", "Bulgaria", "Croatia", "Cyprus", "Czech Republic", "Denmark", "Estonia", "Finland", "France",
  "Germany", "Greece", "Hungary", "Ireland", "Italy", "Latvia", "Lithuania", "Luxembourg", "Malta", "Netherlands",
  "Poland", "Portugal", "Romania", "Slovakia", "Slovenia", "Spain", "Sweden", "Iceland", "Norway", "Liechtenstein",
  // French overseas departments are France.
  "French Guiana", "Guadeloupe", "Martinique",
]);

/**
 * Ibero-American nations: CONMEBOL + Mexico, Central America and the Hispanic Caribbean. Approximates the Spanish
 * dual nationality Latin Americans get after 2 years of residence (the world has no dual nationality).
 */
export const IBERO = new Set([
  ...CONMEBOL, "Mexico", "Costa Rica", "Cuba", "Dominican Republic", "El Salvador", "Guatemala", "Honduras", "Panama",
  "Puerto Rico", "Nicaragua",
]);

/** Africa, Caribbean and Pacific (Cotonou agreement): all CAF, the non-Hispanic Caribbean, all OFC. */
export const ACP = new Set([
  ...CAF, ...OFC, "Barbados", "Cayman Islands", "Curaçao", "Guyana", "Haiti", "Jamaica", "St. Kitts & Nevis",
  "St. Vincent & Grenadines", "Suriname", "Trinidad & Tobago",
]);

export function inGroup(nation: string | null | undefined, group: NationGroup): boolean {
  const n = normalizeNation(nation);
  if (!n) return false;
  if (group === "EU") return EU.has(n);
  if (group === "ibero") return IBERO.has(n);
  return ACP.has(n);
}

import { countryKey } from "@/Domain/cups/cupIds";

/**
 * Flag code (flag-icons stem, see `flags.ts`) of a player nationality as written in the world data
 * (`RosterPlayer.nationality`, a plain country name). `undefined` for an unknown or empty name, so
 * the UI simply shows no flag.
 */
const FLAG_OF: Record<string, string> = {
  Afghanistan: "af", Albania: "al", Algeria: "dz", Andorra: "ad", Angola: "ao", Argentina: "ar", Armenia: "am",
  Australia: "au", Austria: "at", Azerbaijan: "az", Bahrain: "bh", Barbados: "bb", Belarus: "by", Belgium: "be",
  Benin: "bj", Bolivia: "bo", "Bosnia & Herzegovina": "ba", "Bosnia and Herzegovina": "ba", "Bosnia-Herzegovina": "ba",
  Botswana: "bw", Brazil: "br", Bulgaria: "bg", "Burkina Faso": "bf", Burundi: "bi", Cameroon: "cm", Canada: "ca",
  "Cape Verde": "cv", "Cayman Islands": "ky", "Central African Republic": "cf", Chad: "td", Chile: "cl",
  Colombia: "co", Comoros: "km", "Congo - Brazzaville": "cg", "Congo - Kinshasa": "cd", "DR Congo": "cd",
  "Costa Rica": "cr", "Côte d’Ivoire": "ci", "Côte d'Ivoire": "ci", "Ivory Coast": "ci", Croatia: "hr", Cuba: "cu",
  Cyprus: "cy", Czechia: "cz", "Czech Republic": "cz", Denmark: "dk", "Dominican Republic": "do", Ecuador: "ec",
  Egypt: "eg", "El Salvador": "sv", England: "gb-eng", "Equatorial Guinea": "gq", Eritrea: "er", Estonia: "ee",
  Eswatini: "sz", Ethiopia: "et", "Faroe Islands": "fo", Fiji: "fj", Finland: "fi", France: "fr", "French Guiana": "gf",
  Gabon: "ga", Gambia: "gm", Georgia: "ge", Germany: "de", Ghana: "gh", Greece: "gr", Guadeloupe: "gp",
  Guatemala: "gt", Guinea: "gn", "Guinea-Bissau": "gw", Guyana: "gy", Haiti: "ht", Honduras: "hn", Hungary: "hu",
  Iceland: "is", Indonesia: "id", Iran: "ir", Iraq: "iq", Ireland: "ie", Israel: "il", Italy: "it", Jamaica: "jm",
  Japan: "jp", Jordan: "jo", Kazakhstan: "kz", Kenya: "ke", Kosovo: "xk", Kyrgyzstan: "kg", Latvia: "lv",
  Lebanon: "lb", Liberia: "lr", Liechtenstein: "li", Lithuania: "lt", Luxembourg: "lu", Madagascar: "mg",
  Mali: "ml", Malta: "mt", Martinique: "mq", Mauritania: "mr", Mexico: "mx", Moldova: "md", Montenegro: "me",
  Morocco: "ma", Mozambique: "mz", Namibia: "na", Netherlands: "nl", "New Zealand": "nz", Nicaragua: "ni",
  Niger: "ne", Nigeria: "ng", "North Macedonia": "mk", "Northern Ireland": "gb-nir", Norway: "no", Oman: "om",
  "Palestinian Territories": "ps", Panama: "pa", Paraguay: "py", Peru: "pe", Philippines: "ph", Poland: "pl",
  Portugal: "pt", "Puerto Rico": "pr", Qatar: "qa", Romania: "ro", Russia: "ru", Rwanda: "rw", "San Marino": "sm",
  "Saudi Arabia": "sa", Scotland: "gb-sct", Senegal: "sn", Serbia: "rs", Seychelles: "sc", "Sierra Leone": "sl",
  Singapore: "sg", Slovakia: "sk", Slovenia: "si", "Solomon Islands": "sb", Somalia: "so", "South Africa": "za",
  "South Korea": "kr", Spain: "es", "Sri Lanka": "lk", "St. Kitts & Nevis": "kn", "St. Lucia": "lc",
  "St. Vincent & Grenadines": "vc", Sudan: "sd", Suriname: "sr", Sweden: "se", Switzerland: "ch", Tajikistan: "tj",
  Tanzania: "tz", Thailand: "th", Togo: "tg", "Trinidad & Tobago": "tt", "Trinidad and Tobago": "tt", Tunisia: "tn",
  Turkey: "tr", Türkiye: "tr", Turkmenistan: "tm", Uganda: "ug", Ukraine: "ua", "United Arab Emirates": "ae",
  "United States": "us", USA: "us", Uruguay: "uy", Uzbekistan: "uz", Vanuatu: "vu", Venezuela: "ve", Wales: "gb-wls",
  Yemen: "ye", Zambia: "zm", Zimbabwe: "zw",
  // Transfermarkt nationalities (scripts/transfermarkt/nationality.ts)
  Bangladesh: "bd", Bonaire: "bq", China: "cn", "Curaçao": "cw", Libya: "ly", Malaysia: "my", "New Caledonia": "nc",
  Pakistan: "pk", "Papua New Guinea": "pg", "São Tomé & Príncipe": "st", "South Sudan": "ss", Syria: "sy",
  "Timor-Leste": "tl",
  // ESPN citizenship spellings (data_process/espn/snapshot.json, #143) and the few countries only ESPN lists
  "Congo DR": "cd", Congo: "cg", "Cape Verde Islands": "cv", "Republic of Ireland": "ie", "St Lucia": "lc",
  "St Kitts and Nevis": "kn", "Comoros Islands": "km", Palestine: "ps", Lesotho: "ls", Malawi: "mw", India: "in",
  Grenada: "gd", "North Korea": "kp",
};

/** One name per flag (the first spelling of the table): the nationalities a form can offer. */
export const NATIONALITY_NAMES: readonly string[] = (() => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const [name, code] of Object.entries(FLAG_OF)) {
    if (seen.has(code)) continue;
    seen.add(code);
    out.push(name);
  }
  return out;
})();

export function nationalityFlagCode(nationality: string | null | undefined): string | undefined {
  const name = nationality?.trim();
  return name ? FLAG_OF[name] : undefined;
}

/** `nat_<countryKey>` (a national team's id) → flag code; built once from the nationality table. */
let flagByTeamKey: Map<string, string> | null = null;

/** Flag code of a national team id (`nat_poland` → `pl`); `undefined` for a club id or an unknown nation. */
export function nationalTeamFlagCode(teamId: string | null | undefined): string | undefined {
  if (!teamId || !teamId.startsWith("nat_")) return undefined;
  if (flagByTeamKey === null) {
    flagByTeamKey = new Map();
    for (const [name, code] of Object.entries(FLAG_OF)) {
      const key = countryKey(name);
      if (!flagByTeamKey.has(key)) flagByTeamKey.set(key, code);
    }
  }
  return flagByTeamKey.get(teamId.slice(4));
}

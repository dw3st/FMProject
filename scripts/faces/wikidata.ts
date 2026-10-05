/** Shared helpers for the Wikidata/Commons face pilot. curl (Bun's fetch is unreliable on Windows), polite UA. */
/** Leagues covered by the face pilot (the main leagues; the rest of the world keeps the seeded face). */
export const LEAGUES = [
  "premier_league", "la_liga", "bundesliga", "serie_a", "ligue_1", "brazil_serie_a",
  "of_portuguese_primeira_liga", "of_eredivisie", "of_argentine_premier_division", "of_major_league_soccer",
];
/** Search language per league (club names). */
export const LEAGUE_LANG: Record<string, string> = {
  premier_league: "en", la_liga: "es", bundesliga: "de", serie_a: "it", ligue_1: "fr", brazil_serie_a: "pt",
  of_portuguese_primeira_liga: "pt", of_eredivisie: "nl", of_argentine_premier_division: "es", of_major_league_soccer: "en",
};
export const UA = "FMProjectFacesPilot/0.1 (https://westlab.dev; emygdiowestphalen@gmail.com) curl";
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function curlText(url: string, args: string[] = []): Promise<string> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const p = Bun.spawn(["curl", "-s", "-f", "-L", "--max-time", "90", "-A", UA, ...args, url], { stdout: "pipe", stderr: "ignore" });
    const text = await new Response(p.stdout).text();
    if ((await p.exited) === 0 && text) return text;
    await sleep(2000 * attempt);
  }
  throw new Error(`curl failed: ${url.slice(0, 200)}`);
}
export const curlJson = async (url: string, args: string[] = []) => JSON.parse(await curlText(url, args));

export async function sparql(query: string): Promise<any[]> {
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
  const r = await curlJson(url, ["-H", "Accept: application/sparql-results+json"]);
  return r.results.bindings;
}

export async function curlFile(url: string, out: string): Promise<boolean> {
  const p = Bun.spawn(["curl", "-s", "-f", "-L", "--max-time", "60", "-A", UA, "-o", out, url], { stdout: "ignore", stderr: "ignore" });
  return (await p.exited) === 0;
}

/**
 * Where the sun is (4.31): azimuth and elevation for a place, a date and a UTC time (NOAA's approximation, good to a
 * fraction of a degree), sunset, and the local clock of a stadium. Pure; drawing only.
 */
const RAD = Math.PI / 180;

/** Days since 2000-01-01 12:00 UTC for a date and UTC minutes. */
function daysSinceJ2000(date: string, utcMinutes: number): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const ms = Date.UTC(y, m - 1, d) + utcMinutes * 60000;
  return (ms - Date.UTC(2000, 0, 1, 12)) / 86400000;
}

function sunCoords(n: number): { decl: number; eqTime: number } {
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * RAD;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const eps = (23.439 - 0.0000004 * n) * RAD;
  const decl = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  // Equation of time (minutes): mean longitude minus right ascension.
  let e = L - ra / RAD;
  e = ((e + 180) % 360 + 360) % 360 - 180;
  return { decl, eqTime: e * 4 };
}

export interface SunPosition {
  /** Degrees from north, clockwise. */
  azimuth: number;
  /** Degrees above the horizon. */
  elevation: number;
}

export function solarPosition(lat: number, lon: number, date: string, utcMinutes: number): SunPosition {
  const { decl, eqTime } = sunCoords(daysSinceJ2000(date, utcMinutes));
  const solarMinutes = utcMinutes + eqTime + 4 * lon;
  const ha = (solarMinutes / 4 - 180) * RAD;
  const phi = lat * RAD;
  const sinEl = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha);
  const el = Math.asin(Math.max(-1, Math.min(1, sinEl)));
  const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi));
  return { azimuth: ((az / RAD + 180) % 360 + 360) % 360, elevation: el / RAD };
}

/** UTC minutes of sunset (sun 0.833° below the horizon), or null in polar day / night. */
export function sunsetUtcMinutes(lat: number, lon: number, date: string): number | null {
  const { decl, eqTime } = sunCoords(daysSinceJ2000(date, 12 * 60));
  const phi = lat * RAD;
  const cosH = (Math.sin(-0.833 * RAD) - Math.sin(phi) * Math.sin(decl)) / (Math.cos(phi) * Math.cos(decl));
  if (cosH < -1 || cosH > 1) return null;
  const h = Math.acos(cosH) / RAD;
  return 720 - 4 * lon - eqTime + 4 * h;
}

/** nth (1-based; −1 = last) Sunday of a month (UTC date number). */
function sunday(year: number, month: number, nth: number): number {
  if (nth > 0) {
    const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    return 1 + ((7 - first) % 7) + 7 * (nth - 1);
  }
  const lastDay = new Date(Date.UTC(year, month, 0));
  return lastDay.getUTCDate() - lastDay.getUTCDay();
}

/** Local UTC offset in minutes for a date: standard offset plus daylight saving (EU / US rules). */
export function utcOffsetMinutes(tzStd: number, dst: "eu" | "us" | "none", date: string): number {
  const base = tzStd * 60;
  if (dst === "none") return base;
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const md = m * 100 + d;
  const [startM, startD, endM, endD] = dst === "eu"
    ? [3, sunday(y, 3, -1), 10, sunday(y, 10, -1)]
    : [3, sunday(y, 3, 2), 11, sunday(y, 11, 1)];
  return md >= startM * 100 + startD && md < endM * 100 + endD ? base + 60 : base;
}

/** "HH:MM" of a minute count (wrapped to the day). */
export const hhmm = (minutes: number): string => {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

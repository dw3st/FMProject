/** The footer radio's stations (8.8.10, Ouro Verde 8.8.16): public streams, https, open to the browser (CORS). */
export interface RadioStation {
  id: string;
  name: string;
  stream: string;
}

export const RADIO_STATIONS: readonly RadioStation[] = [
  // Curitiba, 93.9 (StreamTheWorld).
  { id: "mundolivre", name: "Mundo Livre FM", stream: "https://playerservices.streamtheworld.com/api/livestream-redirect/MUNDOLIVRE_CWBAAC_64.aac" },
  // Curitiba, 105.5 (brasilstream).
  { id: "ouroverde", name: "Ouro Verde FM", stream: "https://8522.brasilstream.com.br/stream" },
];

/** Index of a saved station id; unknown or absent = the first. */
export function stationIndexOf(id: string | null | undefined): number {
  const i = RADIO_STATIONS.findIndex((s) => s.id === id);
  return i < 0 ? 0 : i;
}

/** The next station, back to the first after the last. */
export function nextStationIndex(i: number): number {
  return (i + 1) % RADIO_STATIONS.length;
}

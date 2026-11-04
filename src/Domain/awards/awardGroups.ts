/** A repeated award shown once with its count (tester report): the first appearance keeps its place. */
export interface AwardGroup<K extends string> { kind: K; count: number; titles: string[] }

export function groupAwards<K extends string>(awards: { kind: K; title: string }[]): AwardGroup<K>[] {
  const byKind = new Map<K, AwardGroup<K>>();
  for (const a of awards) {
    const group = byKind.get(a.kind);
    if (group) {
      group.count++;
      group.titles.push(a.title);
    } else {
      byKind.set(a.kind, { kind: a.kind, count: 1, titles: [a.title] });
    }
  }
  return [...byKind.values()];
}

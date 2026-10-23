/** Reciprocal rank fusion of several ranked id lists. */
export function reciprocalRankFusion(lists: ReadonlyArray<readonly string[]>, k = 60): Map<string, number> {
  const scores = new Map<string, number>();
  for (const list of lists) {
    list.forEach((id, index) => scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1)));
  }
  return new Map([...scores.entries()].sort((a, b) => b[1] - a[1]));
}

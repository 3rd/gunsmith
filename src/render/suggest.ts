const getLevenshteinDistance = (a: string, b: string) => {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const row: number[] = Array.from({ length: n + 1 });
  for (let j = 0; j <= n; j++) row[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j]!;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[n]!;
};

export const suggest = (input: string, candidates: string[], max = 2) => {
  return candidates
    .map((c) => ({ c, d: getLevenshteinDistance(input, c) }))
    .filter((x) => x.d >= 1 && x.d <= max)
    .sort((a, b) => a.d - b.d || a.c.localeCompare(b.c))
    .map((x) => x.c);
};

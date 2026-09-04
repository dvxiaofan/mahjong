export type RandomSource = () => number;

export function shuffle<T>(items: readonly T[], random: RandomSource = Math.random): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(random() * (index + 1));
    [result[index], result[randomIndex]] = [result[randomIndex]!, result[index]!];
  }
  return result;
}

/** A small deterministic generator for reproducible tests and replay. */
export function seededRandom(seed: number): RandomSource {
  let value = seed >>> 0 || 0x9e3779b9;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

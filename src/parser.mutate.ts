/**
 * Seeded pseudo-random number generator (mulberry-style 32-bit LCG).
 * Quality matters only for test reproducibility — not cryptographic.
 */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ----- Helpers -----

const RANDOM_BYTES =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 \t-+*/[]{}<>=#@!?,.;:\'"';
function randomBytes(rng: () => number, n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += RANDOM_BYTES[Math.floor(rng() * RANDOM_BYTES.length)];
  return s;
}

const RANDOM_LINES = [
  '',
  '# Heading',
  '## Subheading',
  '<Some Claim>',
  'Some claim text.',
  '[Some Reason]: Some text.',
  '[A]: w. [B]: x.',
  '<A> -> <B>',
  '<A> -- <B>',
  '<A> +- <B>',
  '<A> ++ <B>',
  '::: evidence',
  '::: position',
  '::: meta',
  '  - bullet',
  '  * star bullet',
  '  key: value',
  '// comment',
];
const ID_POOL = ['A', 'B', 'C', 'Some Claim', 'My Fact', 'Reason', 'Counter'];
function randomLine(rng: () => number): string {
  const tpl = RANDOM_LINES[Math.floor(rng() * RANDOM_LINES.length)]!;
  return tpl
    .replace(/<X>/g, () => ID_POOL[Math.floor(rng() * ID_POOL.length)]!)
    .replace(/\[X\]/g, () => ID_POOL[Math.floor(rng() * ID_POOL.length)]!);
}

function splitLines(s: string): string[] {
  return s.split('\n');
}
function joinLines(lines: string[]): string {
  return lines.join('\n');
}

// ----- Ops -----
// Each op takes (source, rng) and returns a new string. If the op cannot
// apply (e.g. deleteLine on a single-line source), it returns source unchanged.

export function insertLine(source: string, rng: () => number): string {
  const lines = splitLines(source);
  const idx = Math.floor(rng() * (lines.length + 1));
  const out = [...lines];
  out.splice(idx, 0, randomLine(rng));
  return joinLines(out);
}

export function deleteLine(source: string, rng: () => number): string {
  const lines = splitLines(source);
  if (lines.length <= 1) return source;
  const idx = Math.floor(rng() * lines.length);
  const out = [...lines];
  out.splice(idx, 1);
  return joinLines(out);
}

export function swapLines(source: string, rng: () => number): string {
  const lines = splitLines(source);
  if (lines.length < 2) return source;
  const idx = Math.floor(rng() * (lines.length - 1));
  const out = [...lines];
  [out[idx], out[idx + 1]] = [out[idx + 1]!, out[idx]!];
  return joinLines(out);
}

export function duplicateRange(source: string, rng: () => number): string {
  const lines = splitLines(source);
  if (lines.length < 1) return source;
  const start = Math.floor(rng() * lines.length);
  const end = Math.min(lines.length, start + 1 + Math.floor(rng() * 3));
  const slice = lines.slice(start, end);
  const out = [...lines];
  out.splice(end, 0, ...slice);
  return joinLines(out);
}

export function spliceGarbage(source: string, rng: () => number): string {
  const lines = splitLines(source);
  if (lines.length === 0) return randomBytes(rng, 8);
  const lineIdx = Math.floor(rng() * lines.length);
  const line = lines[lineIdx]!;
  const col = Math.floor(rng() * (line.length + 1));
  const n = 1 + Math.floor(rng() * 16);
  lines[lineIdx] = line.slice(0, col) + randomBytes(rng, n) + line.slice(col);
  return joinLines(lines);
}

export function replaceLine(source: string, rng: () => number): string {
  const lines = splitLines(source);
  if (lines.length === 0) {
    return randomLine(rng);
  }
  const idx = Math.floor(rng() * lines.length);
  const out = [...lines];
  out[idx] = randomLine(rng);
  return joinLines(out);
}

// ----- Weighted entry point -----

type Op = (source: string, rng: () => number) => string;

// [weight, op] pairs. Weights sum to 100.
const OPS: ReadonlyArray<readonly [number, Op]> = [
  [30, insertLine],
  [15, deleteLine],
  [10, swapLines],
  [10, duplicateRange],
  [15, spliceGarbage],
  [20, replaceLine],
];

/**
 * Apply one weighted-random mutation to `source`. The op is picked via
 * cumulative-weight sampling so the OPS table is the single source of truth
 * for op probabilities.
 */
export function mutate(source: string, rng: () => number): string {
  const total = OPS.reduce((s, [w]) => s + w, 0);
  let pick = rng() * total;
  for (const [w, op] of OPS) {
    pick -= w;
    if (pick <= 0) return op(source, rng);
  }
  return OPS[OPS.length - 1]![1](source, rng);
}

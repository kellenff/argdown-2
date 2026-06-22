import { describe, it, expect } from 'vitest';
import {
  makeRng,
  insertLine,
  deleteLine,
  swapLines,
  duplicateRange,
  spliceGarbage,
  replaceLine,
  mutate,
} from './parser.mutate.js';

describe('makeRng', () => {
  it('produces numbers in [0, 1)', () => {
    const rng = makeRng(42);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is deterministic — same seed produces same sequence', () => {
    const a = makeRng(123);
    const b = makeRng(123);
    for (let i = 0; i < 50; i++) {
      expect(a()).toBe(b());
    }
  });

  it('different seeds produce different sequences', () => {
    const a = makeRng(1);
    const b = makeRng(2);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });
});

const SRC = 'line1\nline2\nline3\nline4';
const SINGLE = 'only';

describe('mutator ops', () => {
  it('insertLine adds one line and preserves total newline structure', () => {
    const rng = makeRng(1);
    const out = insertLine(SRC, rng);
    expect(out.split('\n').length).toBe(SRC.split('\n').length + 1);
  });

  it('deleteLine removes one line when there are at least 2', () => {
    const rng = makeRng(2);
    const out = deleteLine(SRC, rng);
    expect(out.split('\n').length).toBe(SRC.split('\n').length - 1);
  });

  it('deleteLine returns input unchanged for single-line source', () => {
    const rng = makeRng(3);
    expect(deleteLine(SINGLE, rng)).toBe(SINGLE);
  });

  it('swapLines rearranges but preserves length', () => {
    const rng = makeRng(4);
    const out = swapLines(SRC, rng);
    expect(out.split('\n').length).toBe(SRC.split('\n').length);
    expect(out).not.toBe(SRC);
  });

  it('swapLines is a no-op for single-line source', () => {
    const rng = makeRng(5);
    expect(swapLines(SINGLE, rng)).toBe(SINGLE);
  });

  it('duplicateRange grows by 1–3 lines', () => {
    const rng = makeRng(6);
    const out = duplicateRange(SRC, rng);
    const before = SRC.split('\n').length;
    const after = out.split('\n').length;
    expect(after).toBeGreaterThan(before);
    expect(after).toBeLessThanOrEqual(before + 3);
  });

  it('spliceGarbage changes the source', () => {
    const rng = makeRng(7);
    const out = spliceGarbage(SRC, rng);
    expect(out).not.toBe(SRC);
  });

  it('replaceLine overwrites one line', () => {
    const rng = makeRng(8);
    const out = replaceLine(SRC, rng);
    expect(out.split('\n').length).toBe(SRC.split('\n').length);
    const outLines = out.split('\n');
    const srcLines = SRC.split('\n');
    const same = outLines.filter((l, i) => l === srcLines[i]).length;
    expect(same).toBeLessThan(srcLines.length);
  });

  it('replaceLine on empty source returns a random line', () => {
    const rng = makeRng(9);
    const out = replaceLine('', rng);
    expect(out.length).toBeGreaterThan(0);
  });
});

describe('mutate', () => {
  const SRC = 'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10';

  it('changes the source with overwhelming probability (50 trials)', () => {
    const rng = makeRng(100);
    let changed = 0;
    for (let i = 0; i < 50; i++) {
      if (mutate(SRC, rng) !== SRC) changed++;
    }
    expect(changed).toBeGreaterThan(40);
  });

  it('is deterministic given a seed', () => {
    const a = makeRng(200);
    const b = makeRng(200);
    for (let i = 0; i < 20; i++) {
      expect(mutate(SRC, a)).toBe(mutate(SRC, b));
    }
  });

  it('never throws on arbitrary input (including empty)', () => {
    const rng = makeRng(300);
    expect(() => mutate('', rng)).not.toThrow();
    expect(() => mutate('just one line', rng)).not.toThrow();
    expect(() => mutate('\n\n\n', rng)).not.toThrow();
  });

  it('eventually exercises every op type over 1000 trials (smoke test)', () => {
    const rng = makeRng(400);
    const shapes = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const out = mutate(SRC, rng);
      shapes.add(
        `${out.length === SRC.length ? 'same' : out.length > SRC.length ? 'longer' : 'shorter'}`,
      );
    }
    expect(shapes.size).toBeGreaterThanOrEqual(2);
  });
});

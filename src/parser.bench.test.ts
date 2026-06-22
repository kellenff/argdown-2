import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FIXTURES,
  runBench,
  writeBaselineJson,
  loadBaseline,
  checkAgainstBaseline,
  type BaselineFile,
  type FixtureName,
} from './parser.bench.js';

// Tinybench takes a few seconds to run; vitest's default 5s timeout is too tight.
// Tests use small iterations/time to keep total runtime reasonable.
const FAST_BENCH = { iterations: 5, time: 50 } as const;

describe('FIXTURES', () => {
  it('has exactly 7 entries', () => {
    expect(FIXTURES).toHaveLength(7);
  });

  it('contains the expected fixture names in order', () => {
    const names = FIXTURES.map(([name]) => name);
    expect(names).toEqual([
      'small-claim',
      'small-rule',
      'small-relation',
      'medium-climate',
      'heavy-relations',
      'deep-nesting',
      'large-stress',
    ]);
  });

  it('resolves to existing files', () => {
    for (const [name, path] of FIXTURES) {
      expect(existsSync(path), `fixture ${name} path ${path} does not exist`).toBe(true);
    }
  });

  it('paths are relative to repo root', () => {
    for (const [, path] of FIXTURES) {
      expect(path.startsWith('src/parser.fixtures/')).toBe(true);
    }
  });
});

describe('runBench', () => {
  it('returns one result per fixture', async () => {
    const { results } = await runBench(FAST_BENCH);
    expect(results).toHaveLength(7);
  });

  it('result names match FIXTURES order', async () => {
    const { results } = await runBench(FAST_BENCH);
    const names = results.map((r) => r.name);
    expect(names).toEqual(FIXTURES.map(([n]) => n));
  });

  it('no fixture errors', async () => {
    const { results } = await runBench(FAST_BENCH);
    for (const r of results) {
      expect(r.ok, `fixture ${r.name} errored: ${r.error?.message ?? 'unknown'}`).toBe(true);
    }
  });

  it('captures a peak heap delta per fixture', async () => {
    const { peakHeapMB } = await runBench(FAST_BENCH);
    for (const [name] of FIXTURES) {
      const peak = peakHeapMB.get(name);
      expect(peak, `no peak for ${name}`).toBeDefined();
      expect(peak).toBeGreaterThan(0);
    }
  });
});

describe('writeBaselineJson', () => {
  it('writes a valid baseline file with schemaVersion 1', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'argdown-perf-'));
    try {
      const out = join(dir, 'baseline.json');
      const { results, peakHeapMB } = await runBench(FAST_BENCH);
      await writeBaselineJson(results, peakHeapMB, out);

      const raw = await readFile(out, 'utf8');
      const parsed = JSON.parse(raw) as BaselineFile;

      expect(parsed.schemaVersion).toBe(1);
      expect(typeof parsed.capturedAt).toBe('string');
      expect(parsed.environment).toBeDefined();
      expect(typeof parsed.environment.nodeVersion).toBe('string');
      expect(typeof parsed.environment.platform).toBe('string');
      expect(typeof parsed.environment.arch).toBe('string');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('has one entry per fixture with required fields', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'argdown-perf-'));
    try {
      const out = join(dir, 'baseline.json');
      const { results, peakHeapMB } = await runBench(FAST_BENCH);
      await writeBaselineJson(results, peakHeapMB, out);

      const parsed = JSON.parse(await readFile(out, 'utf8')) as BaselineFile;

      for (const [name] of FIXTURES) {
        const entry = parsed.fixtures[name];
        expect(entry, `missing entry for ${name}`).toBeDefined();
        expect(typeof entry.sizeBytes).toBe('number');
        expect(typeof entry.opsPerSec).toBe('number');
        expect(typeof entry.marginOfError).toBe('number');
        expect(typeof entry.p99Ms).toBe('number');
        expect(typeof entry.peakHeapDeltaMB).toBe('number');
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('throws when a fixture errored', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'argdown-perf-'));
    try {
      const out = join(dir, 'baseline.json');
      const fakeResults = [{ name: 'small-claim', ok: false, hz: 0, p99: 0, rme: 0 }];
      const peakHeapMB = new Map<FixtureName, number>();
      await expect(writeBaselineJson(fakeResults, peakHeapMB, out)).rejects.toThrow(/errored/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('loadBaseline', () => {
  it('throws when baseline file is missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'argdown-perf-'));
    try {
      const baselinePath = join(dir, 'missing.json');
      await expect(loadBaseline(baselinePath)).rejects.toThrow(/no baseline/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('throws on schema version mismatch', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'argdown-perf-'));
    try {
      const baselinePath = join(dir, 'baseline.json');
      await writeFile(
        baselinePath,
        JSON.stringify({
          schemaVersion: 2,
          capturedAt: '2026-06-22T00:00:00.000Z',
          environment: { nodeVersion: 'v22.0.0', platform: 'darwin', arch: 'arm64' },
          fixtures: {},
        }),
        'utf8',
      );
      await expect(loadBaseline(baselinePath)).rejects.toThrow(/schema/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('checkAgainstBaseline', () => {
  it('throws when a bench result errored', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'argdown-perf-'));
    try {
      const out = join(dir, 'baseline.json');
      const { results, peakHeapMB } = await runBench(FAST_BENCH);
      await writeBaselineJson(results, peakHeapMB, out);
      const baseline = await loadBaseline(out);

      const errored: typeof results = results.map((r) => ({ ...r }));
      errored[0] = Object.assign({}, errored[0], { ok: false, error: new Error('boom') });
      await expect(checkAgainstBaseline(errored, peakHeapMB, baseline)).rejects.toThrow(/errored/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('throws when baseline is missing a fixture entry', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'argdown-perf-'));
    try {
      const out = join(dir, 'baseline.json');
      const { results, peakHeapMB } = await runBench(FAST_BENCH);
      await writeBaselineJson(results, peakHeapMB, out);
      const baseline = await loadBaseline(out);
      delete (baseline.fixtures as Record<string, unknown>)['large-stress'];

      await expect(checkAgainstBaseline(results, peakHeapMB, baseline)).rejects.toThrow(
        /large-stress/,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('prints no diff and returns when current matches baseline exactly', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'argdown-perf-'));
    try {
      const out = join(dir, 'baseline.json');
      const { results, peakHeapMB } = await runBench(FAST_BENCH);
      await writeBaselineJson(results, peakHeapMB, out);
      const baseline = await loadBaseline(out);
      // Same results → no diff.
      await expect(checkAgainstBaseline(results, peakHeapMB, baseline)).resolves.toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reports a diff when ops/sec regresses by more than the tolerance', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'argdown-perf-'));
    try {
      const out = join(dir, 'baseline.json');
      const { results, peakHeapMB } = await runBench(FAST_BENCH);
      await writeBaselineJson(results, peakHeapMB, out);
      const baseline = await loadBaseline(out);
      // Pretend current ops/sec is half the baseline (50% slower).
      const slowed = results.map((r) => ({ ...r, hz: r.hz / 2 }));
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      try {
        await expect(checkAgainstBaseline(slowed, peakHeapMB, baseline)).resolves.toBeUndefined();
        expect(log).toHaveBeenCalledWith('Performance diff vs baseline:');
      } finally {
        log.mockRestore();
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// Local vi import for spyOn
import { vi } from 'vitest';

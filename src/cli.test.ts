// src/cli.test.ts
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI_PATH = join(process.cwd(), 'dist', 'cli.js');

function runCli(
  args: string[],
  stdin?: string,
): { stdout: string; stderr: string; status: number } {
  const result = spawnSync(process.execPath, [CLI_PATH, ...args], {
    input: stdin,
    encoding: 'utf8',
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status ?? -1,
  };
}

describe('CLI --solve', () => {
  it('prints IN/OUT/UNDEC summary without the Dropped line', () => {
    const dir = mkdtempSync(join(tmpdir(), 'argdown-cli-'));
    const file = join(dir, 'doc.argdown');
    writeFileSync(file, '[#a].\n[#b].\n[#a] --x [#b].\n');
    const out = runCli(['--solve', file]);
    expect(out.status).toBe(0);
    expect(out.stdout).toContain('IN');
    expect(out.stdout).toContain('OUT');
    expect(out.stdout).not.toContain('Dropped:');
    expect(out.stdout).toContain('a');
    expect(out.stdout).toContain('b');
  });

  it('runs Method 1 by default (pure Dung)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'argdown-cli-'));
    const file = join(dir, 'doc.argdown');
    // Support + counter-attack on supporter: Method 1 says A=out, B=in (unattacked).
    writeFileSync(file, '[#a].\n[#b].\n[#x].\n[#a] --> [#b].\n[#x] --x [#a].\n');
    const out = runCli(['--solve', file]);
    expect(out.status).toBe(0);
    expect(out.stdout).toContain('a');
    // Method 1 demotes A to OUT; B stays IN (unattacked after support is dropped).
    expect(out.stdout).toMatch(/OUT \(\d+\):[^]*\ba\b/);
  });

  it('runs Method 2 (bipolar) with --semantics=bipolar', () => {
    const dir = mkdtempSync(join(tmpdir(), 'argdown-cli-'));
    const file = join(dir, 'doc.argdown');
    // Same doc as the previous test. Under Method 2: a=in (aux s OUT; someOut promotes A);
    // b=in (unattacked); x=in (unattacked source). All three are IN; OUT is empty.
    writeFileSync(file, '[#a].\n[#b].\n[#x].\n[#a] --> [#b].\n[#x] --x [#a].\n');
    const out = runCli(['--solve', '--semantics=bipolar', file]);
    expect(out.status).toBe(0);
    expect(out.stdout).toMatch(/IN \(\d+\):[^]*\ba\b/);
    expect(out.stdout).toMatch(/IN \(\d+\):[^]*\bb\b/);
    expect(out.stdout).toMatch(/IN \(\d+\):[^]*\bx\b/);
    // OUT row has no entries for this doc.
    expect(out.stdout).toMatch(/OUT \(0\):\s*$/m);
  });

  it('rejects --semantics without --solve', () => {
    const out = runCli(['--semantics=bipolar']);
    expect(out.status).not.toBe(0);
    expect(out.stderr).toContain('--semantics requires --solve');
  });

  it('rejects unknown --semantics values', () => {
    const out = runCli(['--solve', '--semantics=foo']);
    expect(out.status).not.toBe(0);
    expect(out.stderr).toContain('--semantics must be one of: dung, bipolar');
  });
});

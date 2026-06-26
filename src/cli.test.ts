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
  it('prints IN/OUT/UNDEC summary and dropped counts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'argdown-cli-'));
    const file = join(dir, 'doc.argdown');
    writeFileSync(file, '[#a].\n[#b].\n[#a] --x [#b].\n');
    const out = runCli(['--solve', file]);
    expect(out.status).toBe(0);
    expect(out.stdout).toContain('IN');
    expect(out.stdout).toContain('OUT');
    expect(out.stdout).toContain('Dropped:');
    expect(out.stdout).toContain('a');
    expect(out.stdout).toContain('b');
  });
});

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

  it('runs Method 3 (aspic) with --semantics=aspic', () => {
    const dir = mkdtempSync(join(tmpdir(), 'argdown-cli-'));
    const file = join(dir, 'doc.argdown');
    // Same doc as the bipolar test. Under ASPIC+: support is dropped, so
    // x attacks a, b is unattacked. a=out, b=in, x=in.
    writeFileSync(file, '[#a].\n[#b].\n[#x].\n[#a] --> [#b].\n[#x] --x [#a].\n');
    const out = runCli(['--solve', '--semantics=aspic', file]);
    expect(out.status).toBe(0);
    expect(out.stdout).toMatch(/IN \(\d+\):[^]*\bb\b/);
    expect(out.stdout).toMatch(/IN \(\d+\):[^]*\bx\b/);
    expect(out.stdout).toMatch(/OUT \(\d+\):[^]*\ba\b/);
  });

  it('rejects unknown --semantics values', () => {
    const out = runCli(['--solve', '--semantics=foo']);
    expect(out.status).not.toBe(0);
    expect(out.stderr).toMatch(/--semantics must be one of/);
  });

  it('warns on legacy flag form but still dispatches to solve', () => {
    // Pre-consolidation the binary rejected `--semantics` without `--solve`.
    // After consolidation `--semantics` is a `solve` subcommand flag, so the
    // legacy form is accepted (with a deprecation hint) and dispatches into
    // the solver.
    const out = runCli(['--semantics=bipolar']);
    expect(out.status).toBe(0);
    expect(out.stderr).toContain('legacy flag form is deprecated');
    expect(out.stdout).toMatch(/IN \(\d+\)/);
  });
});

const MULTI_EX_SEMANTICS = [
  'preferred',
  'preferred-bipolar',
  'preferred-aspic',
  'preferred-evidential',
  'stable',
  'stable-bipolar',
  'stable-aspic',
  'stable-evidential',
  'complete',
  'complete-bipolar',
  'complete-aspic',
  'complete-evidential',
] as const;

describe('CLI multi-extension --semantics', () => {
  for (const semantics of MULTI_EX_SEMANTICS) {
    it(`runs --semantics=${semantics} and prints Extension lines`, () => {
      const dir = mkdtempSync(join(tmpdir(), 'argdown-cli-'));
      const file = join(dir, 'doc.argdown');
      // Dung/bipolar/evidential use a 2-cycle (mutual attacks, no preferences
      // needed): 2 preferred/stable extensions {A}, {B}; 3 complete incl. ∅.
      // ASPIC+ '--x' attacks require strictly-greater preference to defeat,
      // so a 2-cycle with --x collapses to a one-sided defeat map and yields
      // no stable extensions. Use mutual '-.-' (undercut) instead: undercuts
      // always win, so both directions defeat each other and we get the same
      // textbook Dung outcome.
      const src =
        semantics.endsWith('-aspic')
          ? '[#A] x.\n[#B] y.\n[#A] -.-> [#B].\n[#B] -.-> [#A].\n'
          : '[#A] x.\n[#B] y.\n[#A] --x [#B].\n[#B] --x [#A].\n';
      writeFileSync(file, src);
      const out = runCli(['--solve', `--semantics=${semantics}`, file]);
      expect(out.status).toBe(0);
      // Should print some "Extension N:" lines for preferred, stable, complete.
      // For bipolar/evidential the 2-cycle produces the same extensions.
      if (
        semantics.startsWith('preferred') ||
        semantics.startsWith('stable') ||
        semantics.startsWith('complete')
      ) {
        expect(out.stdout).toContain('Extension 1:');
      }
    });
  }

  it('rejects --semantics=preferred-garbage (unknown reduction)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'argdown-cli-'));
    const file = join(dir, 'doc.argdown');
    writeFileSync(file, '[#a].\n');
    const out = runCli(['--solve', '--semantics=preferred-garbage', file]);
    expect(out.status).not.toBe(0);
    expect(out.stderr).toMatch(/--semantics must be one of/);
  });

  it('prints empty stable result without crashing (3-cycle has 0 stable)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'argdown-cli-'));
    const file = join(dir, 'doc.argdown');
    // 3-cycle has 0 stable extensions by textbook Dung.
    writeFileSync(file, '[#A] x.\n[#B] y.\n[#C] z.\n[#A] --x [#B].\n[#B] --x [#C].\n[#C] --x [#A].\n');
    const out = runCli(['--solve', '--semantics=stable', file]);
    expect(out.status).toBe(0);
    // For empty result, CLI prints "(no extensions)" rather than Extension lines.
    expect(out.stdout).toContain('(no extensions)');
  });
});

describe('consolidated CLI — subcommands', () => {
  function writeDoc(src: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'argdown-cli-'));
    const file = join(dir, 'doc.argdown');
    writeFileSync(file, src);
    return file;
  }

  it('--help lists every subcommand and exits 0', () => {
    const out = runCli(['--help']);
    expect(out.status).toBe(0);
    for (const cmd of ['render', 'solve', 'ast', 'validate', 'format', 'mcp']) {
      expect(out.stdout).toContain(cmd);
    }
    // The help text must mention the binary name itself.
    expect(out.stdout).toContain('argdown');
  });

  it('--version prints a version string and exits 0', () => {
    const out = runCli(['--version']);
    expect(out.status).toBe(0);
    expect(out.stdout).toMatch(/^argdown \S+/);
  });

  it('render: writes a Mermaid flowchart to stdout', () => {
    const file = writeDoc('[#A] --> [#B].\n[#B] --> [#C].\n');
    const out = runCli(['render', file]);
    expect(out.status).toBe(0);
    expect(out.stdout).toContain('flowchart');
    expect(out.stdout).toContain('A');
    expect(out.stdout).toContain('B');
  });

  it('render: reads from stdin when no file is given', () => {
    const out = runCli(['render'], '[#X] --> [#Y].\n');
    expect(out.status).toBe(0);
    expect(out.stdout).toContain('flowchart');
    expect(out.stdout).toContain('X');
  });

  it('solve: default semantics (no --semantics) runs pure Dung', () => {
    const file = writeDoc('[#a].\n[#b].\n[#a] --x [#b].\n');
    const out = runCli(['solve', file]);
    expect(out.status).toBe(0);
    expect(out.stdout).toContain('IN');
    expect(out.stdout).toContain('OUT');
    expect(out.stdout).toContain('UNDEC');
  });

  it('solve: --semantics=bipolar runs Method 2', () => {
    const file = writeDoc('[#a].\n[#b].\n[#x].\n[#a] --> [#b].\n[#x] --x [#a].\n');
    const out = runCli(['solve', '--semantics=bipolar', file]);
    expect(out.status).toBe(0);
    expect(out.stdout).toMatch(/IN \(\d+\):[^]*\ba\b/);
    expect(out.stdout).toMatch(/IN \(\d+\):[^]*\bb\b/);
  });

  it('solve: rejects unknown --semantics with non-zero exit', () => {
    const file = writeDoc('[#a].\n');
    const out = runCli(['solve', '--semantics=nonsense', file]);
    expect(out.status).not.toBe(0);
    expect(out.stderr).toMatch(/--semantics must be one of/);
  });

  it('ast: dumps the AST as JSON to stdout', () => {
    const file = writeDoc('[#a] claim.\n[#b] other.\n[#a] --> [#b].\n');
    const out = runCli(['ast', file]);
    expect(out.status).toBe(0);
    // The JSON should round-trip through JSON.parse cleanly.
    const parsed = JSON.parse(out.stdout) as { kind?: string; elements?: unknown[] };
    expect(parsed.kind).toBe('Document');
    expect(Array.isArray(parsed.elements)).toBe(true);
    expect((parsed.elements as unknown[]).length).toBeGreaterThan(0);
  });

  it('ast: writes nothing to stdout on parse failure (just stderr + non-zero)', () => {
    const file = writeDoc('[#a -->\n'); // malformed
    const out = runCli(['ast', file]);
    expect(out.status).not.toBe(0);
    expect(out.stdout).toBe('');
    expect(out.stderr).toMatch(/parse error/);
  });

  it('validate: exits 0 on a well-formed document and writes nothing', () => {
    const file = writeDoc('[#a].\n[#b].\n[#a] --> [#b].\n');
    const out = runCli(['validate', file]);
    expect(out.status).toBe(0);
    expect(out.stdout).toBe('');
  });

  it('validate: exits non-zero on a malformed document', () => {
    const file = writeDoc('[#a -->\n');
    const out = runCli(['validate', file]);
    expect(out.status).not.toBe(0);
    expect(out.stdout).toBe('');
    expect(out.stderr).toMatch(/parse error/);
  });

  it('format: emits the round-tripped source via stringify', () => {
    const file = writeDoc('[#a].\n[#b].\n[#a] --> [#b].\n');
    const out = runCli(['format', file]);
    expect(out.status).toBe(0);
    // The stringifier should at minimum preserve the fact keys and the
    // relation arrow shape — we don't pin the full source layout, just the
    // load-bearing tokens that prove the round-trip worked.
    expect(out.stdout).toContain('#a');
    expect(out.stdout).toContain('#b');
    expect(out.stdout).toContain('-->');
  });

  it('unknown subcommand exits non-zero and prints help', () => {
    const out = runCli(['frobnicate']);
    expect(out.status).not.toBe(0);
    expect(out.stderr).toMatch(/unknown command "frobnicate"/);
    expect(out.stdout).toContain('render');
  });

  it('legacy --solve form still works (backward compat)', () => {
    const file = writeDoc('[#a].\n[#b].\n[#a] --x [#b].\n');
    const out = runCli(['--solve', file]);
    expect(out.status).toBe(0);
    // Legacy form should emit a deprecation hint to stderr.
    expect(out.stderr).toContain('legacy flag form is deprecated');
    // And the body should look like the solve subcommand output.
    expect(out.stdout).toContain('IN');
  });

  it('legacy --solve --semantics=aspic form still works', () => {
    const file = writeDoc('[#a].\n[#b].\n[#x].\n[#a] --> [#b].\n[#x] --x [#a].\n');
    const out = runCli(['--solve', '--semantics=aspic', file]);
    expect(out.status).toBe(0);
    expect(out.stderr).toContain('legacy flag form is deprecated');
    expect(out.stdout).toMatch(/IN \(\d+\):[^]*\bb\b/);
    expect(out.stdout).toMatch(/OUT \(\d+\):[^]*\ba\b/);
  });

  it('mcp: starts an MCP server on stdio, exits 0 when stdin is closed', () => {
    // `argdown mcp` blocks on `StdioServerTransport` reading from stdin.
    // If we close stdin immediately, the EOF handler in src/cli/mcp.ts
    // tears the server down and the process exits cleanly with status 0.
    // We're not driving the protocol here — that's the in-process test in
    // src/cli/mcp.test.ts. This test only proves that:
    //   1. `argdown mcp` is a real subcommand (dispatcher routes to it)
    //   2. The server starts without crashing
    //   3. EOF on stdin = clean shutdown, not a non-zero exit
    const result = spawnSync(process.execPath, [CLI_PATH, 'mcp'], {
      input: '',
      encoding: 'utf8',
      // Don't pull in our process's stdin — we want the child to see EOF
      // immediately, not block on the parent's tty.
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    expect(result.status).toBe(0);
  });

  it('mcp: rejects trailing args with a non-zero exit', () => {
    // `argdown mcp` takes no arguments. Anything else should fail loudly
    // rather than being silently ignored.
    const result = spawnSync(process.execPath, [CLI_PATH, 'mcp', '--bogus'], {
      input: '',
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/mcp takes no arguments/);
  });
});

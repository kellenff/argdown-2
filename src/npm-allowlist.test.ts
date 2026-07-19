import { assertEquals } from '@std/assert';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(root, 'scripts/check-npm-allowlist.sh');

Deno.test('npm allowlist script exits 0', async () => {
  const cmd = new Deno.Command('bash', {
    args: [script],
    cwd: root,
    stdout: 'piped',
    stderr: 'piped',
  });
  const { code, stdout } = await cmd.output();
  assertEquals(code, 0);
  assertEquals(new TextDecoder().decode(stdout).includes('check-npm-allowlist: ok'), true);
});

Deno.test('npm allowlist script rejects disallowed specifier', async () => {
  const dir = await Deno.makeTempDir();
  const denoJson = join(dir, 'deno.json');
  await Deno.writeTextFile(
    denoJson,
    JSON.stringify({
      imports: {
        lodash: 'npm:lodash@4.17.21',
      },
    }),
  );
  try {
    const cmd = new Deno.Command('bash', {
      args: [script, denoJson],
      cwd: root,
      stdout: 'piped',
      stderr: 'piped',
    });
    const { code, stderr } = await cmd.output();
    assertEquals(code, 1);
    assertEquals(
      new TextDecoder().decode(stderr).includes('npm: specifier not allowlisted: npm:lodash@4.17.21'),
      true,
    );
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

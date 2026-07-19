import { assertEquals } from '@std/assert';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

Deno.test('npm allowlist script exits 0', async () => {
  const cmd = new Deno.Command('bash', {
    args: [join(root, 'scripts/check-npm-allowlist.sh')],
    cwd: root,
    stdout: 'piped',
    stderr: 'piped',
  });
  const { code, stdout } = await cmd.output();
  assertEquals(code, 0);
  assertEquals(new TextDecoder().decode(stdout).includes('check-npm-allowlist: ok'), true);
});

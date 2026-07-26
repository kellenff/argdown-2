import { assertEquals } from "@std/assert";

const FIXTURE_PATH = new URL(
  "../bench.fixtures/mixed-semantics.edn",
  import.meta.url,
).pathname;

const FORMATS = ["table", "json", "dot", "mermaid"] as const;

async function runCli(
  args: string[],
): Promise<{ stdout: string; code: number }> {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "src/cli.ts", ...args, FIXTURE_PATH],
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout } = await cmd.output();
  return { code, stdout: new TextDecoder().decode(stdout) };
}

for (const format of FORMATS) {
  Deno.test(`snapshot: --format=${format}`, async () => {
    const { code, stdout } = await runCli([`--format=${format}`]);
    // Always assert the CLI succeeds, even in update mode — a non-zero exit
    // would write garbage to the snapshot file.
    assertEquals(code, 0);
    const snapshotPath = new URL(
      `./__snapshots__/mixed-semantics.${format}.txt`,
      import.meta.url,
    ).pathname;
    if (Deno.env.get("UPDATE_SNAPSHOTS") === "1") {
      await Deno.writeTextFile(snapshotPath, stdout);
      return;
    }
    const expected = await Deno.readTextFile(snapshotPath);
    assertEquals(stdout, expected);
  });
}

import { assertEquals } from "@std/assert";

const FIXTURE_PATH = new URL(
  "../../bench.fixtures/mixed-semantics.edn",
  import.meta.url,
).pathname;

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

Deno.test("snapshot: --format=table", async () => {
  const { code, stdout } = await runCli(["--format=table"]);
  assertEquals(code, 0);
  const expected = await Deno.readTextFile(
    new URL("./__snapshots__/mixed-semantics.table.txt", import.meta.url)
      .pathname,
  );
  assertEquals(stdout, expected);
});

Deno.test("snapshot: --format=json", async () => {
  const { code, stdout } = await runCli(["--format=json"]);
  assertEquals(code, 0);
  const expected = await Deno.readTextFile(
    new URL("./__snapshots__/mixed-semantics.json.txt", import.meta.url)
      .pathname,
  );
  assertEquals(stdout, expected);
});

Deno.test("snapshot: --format=dot", async () => {
  const { code, stdout } = await runCli(["--format=dot"]);
  assertEquals(code, 0);
  const expected = await Deno.readTextFile(
    new URL("./__snapshots__/mixed-semantics.dot.txt", import.meta.url)
      .pathname,
  );
  assertEquals(stdout, expected);
});

Deno.test("snapshot: --format=mermaid", async () => {
  const { code, stdout } = await runCli(["--format=mermaid"]);
  assertEquals(code, 0);
  const expected = await Deno.readTextFile(
    new URL("./__snapshots__/mixed-semantics.mermaid.txt", import.meta.url)
      .pathname,
  );
  assertEquals(stdout, expected);
});

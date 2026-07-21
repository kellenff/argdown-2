import { assertEquals } from "@std/assert";
import { readInput } from "./input.js";

Deno.test("readInput reads from file path", async () => {
  const path = new URL("../../README.md", import.meta.url).pathname;
  const text = await readInput(path);
  assertEquals(text.length > 0, true);
});

Deno.test("readInput reads from stdin when path is '-'", async () => {
  const expected = "hello from stdin\n";
  const cmd = new Deno.Command(Deno.execPath(), {
    args: [
      "eval",
      `import { readInput } from "${
        new URL("./input.ts", import.meta.url).pathname
      }";\nawait Deno.stdout.write(new TextEncoder().encode(await readInput("-")))`,
    ],
    stdin: "piped",
    stdout: "piped",
  });
  const process = cmd.spawn();
  const writer = process.stdin.getWriter();
  await writer.write(new TextEncoder().encode(expected));
  await writer.close();
  const { stdout } = await process.output();
  const actual = new TextDecoder().decode(stdout);
  assertEquals(actual, expected);
});

Deno.test("readInput throws on missing file", async () => {
  let threw = false;
  try {
    await readInput("/nonexistent/path/to/file.edn");
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});

import { assertEquals, assertStringIncludes } from "@std/assert";

Deno.test("cli --help prints usage and exits 0", async () => {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "src/cli.ts", "--help"],
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout } = await cmd.output();
  assertEquals(code, 0);
  const out = new TextDecoder().decode(stdout);
  assertStringIncludes(out, "argdown-2");
  assertStringIncludes(out, "--dry-run");
  assertStringIncludes(out, "--format");
});

Deno.test("cli --version prints version and exits 0", async () => {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "src/cli.ts", "--version"],
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout } = await cmd.output();
  assertEquals(code, 0);
  const out = new TextDecoder().decode(stdout);
  assertStringIncludes(out, "argdown-2");
  assertStringIncludes(out, "0.2.0");
});

Deno.test("cli with no args prints usage and exits 2", async () => {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "src/cli.ts"],
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stderr } = await cmd.output();
  assertEquals(code, 2);
  const err = new TextDecoder().decode(stderr);
  assertStringIncludes(err, "Usage:");
});

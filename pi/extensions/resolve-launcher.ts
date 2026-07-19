import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolve scripts/argdown-2-mcp from a file URL under pi/extensions/.
 * Layout: <packageRoot>/pi/extensions/<file> → <packageRoot>/scripts/argdown-2-mcp
 */
export function resolveLauncherPath(extensionModuleUrl: string): string {
  const extensionDir = dirname(fileURLToPath(extensionModuleUrl));
  const packageRoot = join(extensionDir, "..", "..");
  const launcher = join(packageRoot, "scripts", "argdown-2-mcp");
  if (!existsSync(launcher)) {
    throw new Error(
      `argdown-2 launcher not found at ${launcher}. ` +
        `Reinstall the Pi package so the git clone includes scripts/argdown-2-mcp.`,
    );
  }
  return launcher;
}

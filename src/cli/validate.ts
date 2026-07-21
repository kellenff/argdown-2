import { loadAndReport } from "./load.js";

export function runValidate(
  source: string,
  options: { quiet: boolean },
): number {
  const loaded = loadAndReport(source, options);
  return loaded.ok ? 0 : 1;
}

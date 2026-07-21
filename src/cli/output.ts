export function writeStdout(text: string): void {
  Deno.stdout.writeSync(new TextEncoder().encode(text));
}

export function writeStderr(text: string): void {
  Deno.stderr.writeSync(new TextEncoder().encode(text));
}

export function writeDiagnostic(diagnostic: {
  code: string;
  message: string;
  location?: { line: number; column: number };
}): string {
  const loc = diagnostic.location
    ? ` (line ${diagnostic.location.line}, col ${diagnostic.location.column})`
    : "";
  return `${diagnostic.code}${loc}: ${diagnostic.message}\n`;
}

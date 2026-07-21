export async function readInput(path: string): Promise<string> {
  if (path === "-") {
    const decoder = new TextDecoder();
    const chunks: Uint8Array[] = [];
    for await (const chunk of Deno.stdin.readable) {
      chunks.push(chunk);
    }
    return decoder.decode(await new Blob(chunks as BlobPart[]).arrayBuffer());
  }
  return await Deno.readTextFile(path);
}

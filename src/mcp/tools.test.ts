import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  runAddRelation,
  runAddStatement,
  runCreateDocument,
  runSolve,
  runValidate,
} from './tools.js';

function parseBody(res: { content: { type: string; text: string }[] }) {
  return JSON.parse(res.content[0]!.text) as Record<string, unknown>;
}

describe('mcp tool handlers', () => {
  it('create + add_statement + validate + solve on a path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'argdown-mcp-'));
    const path = join(dir, 'doc.edn');
    const created = await runCreateDocument({ path });
    expect(parseBody(created).ok).toBe(true);
    await runAddStatement({ path, id: 'a', text: 'A' });
    await runAddStatement({ path, id: 'b', text: 'B' });
    await runAddRelation({ path, kind: 'attack', from: 'a', to: 'b' });
    const validated = await runValidate({ path });
    expect(parseBody(validated).ok).toBe(true);
    const solved = await runSolve({ path });
    const body = parseBody(solved);
    expect(body.ok).toBe(true);
    expect(body.labels).toMatchObject({ a: 'in', b: 'out' });
    const disk = await readFile(path, 'utf8');
    expect(disk).toContain(':a');
  });

  it('source mode: create, add_statement, validate', async () => {
    const created = await runCreateDocument({ source: '' });
    const createBody = parseBody(created);
    expect(createBody.ok).toBe(true);
    expect(typeof createBody.source).toBe('string');

    const added = await runAddStatement({
      source: createBody.source as string,
      id: 'a',
    });
    const addedBody = parseBody(added);
    expect(addedBody.ok).toBe(true);
    expect(typeof addedBody.source).toBe('string');

    const validated = await runValidate({ source: addedBody.source as string });
    expect(parseBody(validated).ok).toBe(true);
  });

  it('source mode: censorship-shaped build with prose text threading', async () => {
    const created = await runCreateDocument({ source: '' });
    let source = parseBody(created).source as string;

    const addCensorship = await runAddStatement({
      source,
      id: 'censorship',
      text: 'Censorship is not wrong in principle.',
    });
    source = parseBody(addCensorship).source as string;

    const addFreedom = await runAddStatement({
      source,
      id: 'absolute-freedom',
      text: 'Freedom of speech is an absolute right.',
    });
    source = parseBody(addFreedom).source as string;

    const addAttack = await runAddRelation({
      source,
      kind: 'attack',
      from: 'absolute-freedom',
      to: 'censorship',
    });
    source = parseBody(addAttack).source as string;

    const validated = await runValidate({ source });
    expect(parseBody(validated).ok).toBe(true);

    const solved = await runSolve({ source });
    const body = parseBody(solved);
    expect(body.ok).toBe(true);
    expect(body.labels).toMatchObject({
      censorship: 'out',
      'absolute-freedom': 'in',
    });
    expect(source).toContain('Censorship is not wrong in principle.');
    expect(source).toContain('Freedom of speech is an absolute right.');
  });
});

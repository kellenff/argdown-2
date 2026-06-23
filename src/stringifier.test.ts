// src/stringifier.test.ts
import { describe, expect, it } from 'vitest';
import { stringify } from './stringifier.js';
import { parse } from './parser.js';

describe('stringify', () => {
  it('exports a function', () => {
    expect(typeof stringify).toBe('function');
  });

  it('produces output the parser accepts for an empty document', () => {
    const result = parse('');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(stringify(result.ast)).toBe('');
  });
});

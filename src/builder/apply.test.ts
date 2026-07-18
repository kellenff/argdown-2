import { describe, expect, it } from 'vitest';

import { emptyDocument } from './apply.js';
import { GROUNDED_SOLVER_TAG } from '../model.js';

describe('emptyDocument', () => {
  it('returns a grounded candidate with no elements', () => {
    expect(emptyDocument()).toEqual({
      solver: GROUNDED_SOLVER_TAG,
      elements: [],
    });
  });
});

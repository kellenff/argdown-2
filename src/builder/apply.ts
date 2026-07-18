import { GROUNDED_SOLVER_TAG, type CandidateDocument } from '../model.js';

export function emptyDocument(): CandidateDocument {
  return { solver: GROUNDED_SOLVER_TAG, elements: [] };
}

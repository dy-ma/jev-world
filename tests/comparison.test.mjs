import test from 'node:test';
import assert from 'node:assert/strict';
import { compareCells } from '../lib/comparison.mjs';

test('comparison distinguishes identical probabilities from threshold agreement', () => {
  const result = compareCells([.1,.49,.9,.5], [.2,.51,.9,.49]);
  assert.equal(result.identicalProbabilities, 1);
  assert.equal(result.classificationChanges, 2);
  assert.equal(result.classificationAgreement, .5);
  assert.deepEqual(result.changedIndices, [1,3]);
  assert.ok(Math.abs(result.meanAbsoluteDifference - .0325) < 1e-10);
});
test('comparison refuses incomplete or mismatched maps', () => {
  assert.throws(() => compareCells([.1], [null]));
  assert.throws(() => compareCells([.1], [.1,.2]));
});

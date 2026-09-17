export function compareCells(baseline, candidate) {
  if (baseline.length !== candidate.length || !baseline.length || [...baseline, ...candidate].some(p => typeof p !== 'number' || !Number.isFinite(p) || p < 0 || p > 1)) throw new Error('Comparison requires two complete probability grids of equal size.');
  let identical = 0, classificationChanges = 0, absoluteSum = 0, squaredSum = 0, maxAbsoluteDifference = 0;
  const changedIndices = [];
  for (let i = 0; i < baseline.length; i++) {
    const delta = Math.abs(baseline[i] - candidate[i]);
    if (delta === 0) identical++;
    if ((baseline[i] >= .5) !== (candidate[i] >= .5)) { classificationChanges++; changedIndices.push(i); }
    absoluteSum += delta; squaredSum += delta * delta;
    maxAbsoluteDifference = Math.max(maxAbsoluteDifference, delta);
  }
  return { points: baseline.length, identicalProbabilities: identical, classificationChanges, classificationAgreement: 1 - classificationChanges / baseline.length, meanAbsoluteDifference: absoluteSum / baseline.length, rootMeanSquareDifference: Math.sqrt(squaredSum / baseline.length), maxAbsoluteDifference, changedIndices };
}

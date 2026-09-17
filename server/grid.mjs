export const WIDTHS = [32, 64, 128, 256, 512];
export function coordinate(index, width) {
  const height = width / 2;
  return { lat: 90 - (Math.floor(index / width) + 0.5) * 180 / height, lon: -180 + (index % width + 0.5) * 360 / width };
}
export { sampleOrder } from '../lib/sampling.mjs';
export function buildRequest(indices, width, model = 'jev-latest') {
  return {
    model,
    state: 'Classify geographic point locations on present-day Earth from your geographic knowledge. Coordinates are latitude and longitude in decimal degrees, north and east positive. Land means continental or island land, including land covered by grounded ice. Oceans, seas, lakes, rivers, and floating sea ice count as water. Classify the exact point, not the majority of a surrounding area. No map, tools, or neighboring predictions are provided.',
    questions: Object.fromEntries(indices.map(i => { const { lat, lon } = coordinate(i, width); return [`p${i}`, { type: 'noul', instructions: `Is the point at latitude ${lat}, longitude ${lon} on land?`, criteria: { true: 'The exact coordinate is on land.', false: 'The exact coordinate is on water.' } }]; })),
  };
}
export function decodeResponse(body, indices) {
  if (!body || typeof body.answers !== 'object') throw new Error('Jev returned an invalid response.');
  return indices.map(index => { const a = body.answers[`p${index}`]; if (a?.type !== 'noul' || typeof a.noul !== 'number' || !Number.isFinite(a.noul) || a.noul < 0 || a.noul > 1) throw new Error('Jev returned a missing or invalid probability.'); return { index, probability: a.noul }; });
}
export function percentile(values, p) {
  if (!values.length) return null;
  return [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(p * values.length) - 1)];
}

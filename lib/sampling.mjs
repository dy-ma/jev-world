// Keep each batch spatially compact, then scatter whole tiles across the map.
export function sampleOrder(width, batchSize = 32, height = width / 2) {
  const tileWidth = Math.min(width, 2 ** Math.ceil(Math.log2(batchSize) / 2));
  const tileHeight = Math.min(height, 2 ** Math.floor(Math.log2(batchSize) / 2));
  const columns = Math.ceil(width / tileWidth), rows = Math.ceil(height / tileHeight);
  const count = columns * rows;
  const tiles = Array.from({ length: count }, (_, i) => i);
  // Stable shuffle avoids accumulating whole columns before neighboring tiles.
  // Keep the first tile at the top-left as an immediate visual anchor.
  let seed = 0x6d2b79f5;
  for (let i = count - 1; i > 1; i--) {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    const j = 1 + (seed >>> 0) % i;
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  const order = [];
  for (const tile of tiles) {
    const left = tile % columns * tileWidth, top = Math.floor(tile / columns) * tileHeight;
    for (let y = top; y < Math.min(top + tileHeight, height); y++) {
      for (let x = left; x < Math.min(left + tileWidth, width); x++) order.push(y * width + x);
    }
  }
  return order;
}

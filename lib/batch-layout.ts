// Only recorded membership determines a batch's shape, never generation defaults.
export function batchLayout(indices: number[], width: number) {
  if (!indices.length) return null;
  const left = Math.min(...indices.map(i => i % width));
  const top = Math.min(...indices.map(i => Math.floor(i / width)));
  const columns = Math.max(...indices.map(i => i % width)) - left + 1;
  const rows = Math.max(...indices.map(i => Math.floor(i / width))) - top + 1;
  return { left, top, columns, rows, rectangular: columns * rows === indices.length,
    cells: indices.map(index => ({ index, column: index % width - left + 1, row: Math.floor(index / width) - top + 1 })),
  };
}

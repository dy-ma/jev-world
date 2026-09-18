import test from 'node:test';
import assert from 'node:assert/strict';
import { batchLayout } from '../lib/batch-layout.ts';
import { sampleOrder, coordinate, buildRequest } from '../server/grid.mjs';

test('inspector adapts to recorded 1, 8, 32, and 64 point batches at every resolution', () => {
  for (const width of [32, 64, 128, 256, 512]) {
    for (const [size, columns, rows] of [[1,1,1], [8,4,2], [32,8,4], [64,8,8]]) {
      const indices = sampleOrder(width, size).slice(size, size * 2);
      const layout = batchLayout(indices, width);
      assert.equal(layout.columns, columns);
      assert.equal(layout.rows, rows);
      assert.equal(layout.rectangular, true);
      assert.deepEqual(layout.cells.map(c => c.index), indices);
      const request = buildRequest(indices, width);
      for (const cell of layout.cells) {
        assert.equal((cell.row - 1 + layout.top) * width + cell.column - 1 + layout.left, cell.index);
        const { lat, lon } = coordinate(cell.index, width);
        assert.equal(request.questions[`p${cell.index}`].instructions, `Is the point at latitude ${lat}, longitude ${lon} on land?`);
      }
    }
  }
});

test('partial, non-tiled, and out-of-order batches retain their actual geometry', () => {
  const layout = batchLayout([67, 0, 3], 64);
  assert.equal(layout.columns, 4); assert.equal(layout.rows, 2);
  assert.equal(layout.rectangular, false);
  assert.deepEqual(layout.cells, [{ index: 67, column: 4, row: 2 }, { index: 0, column: 1, row: 1 }, { index: 3, column: 4, row: 1 }]);
  assert.equal(batchLayout([], 64), null);
});

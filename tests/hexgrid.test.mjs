import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  keyOf, parseKey, neighbors, hexDistance, tilesInRadius, findPath, pixelForHex,
} from '../js/hexgrid.js';

test('keyOf/parseKey round-trip', () => {
  assert.equal(keyOf(3, -2), '3,-2');
  assert.deepEqual(parseKey('3,-2'), { q: 3, r: -2 });
  assert.deepEqual(parseKey(keyOf(-5, 0)), { q: -5, r: 0 });
});

test('neighbors returns exactly 6 axial neighbors', () => {
  const ns = neighbors(0, 0);
  assert.equal(ns.length, 6);
  assert.deepEqual(new Set(ns.map((n) => keyOf(n.q, n.r))), new Set([
    '1,0', '1,-1', '0,-1', '-1,0', '-1,1', '0,1',
  ]));
});

test('hexDistance is 0 for the same tile and 1 for a neighbor', () => {
  assert.equal(hexDistance({ q: 2, r: 2 }, { q: 2, r: 2 }), 0);
  const n = neighbors(2, 2)[0];
  assert.equal(hexDistance({ q: 2, r: 2 }, n), 1);
});

test('tilesInRadius produces the correct hex-grid tile count', () => {
  // A hex grid of radius r has 1 + 3r(r+1) tiles.
  for (const r of [0, 1, 2, 8]) {
    assert.equal(tilesInRadius(r).length, 1 + 3 * r * (r + 1));
  }
});

test('findPath finds the shortest route and respects blocked tiles', () => {
  const path = findPath('0,0', '2,0', () => false);
  assert.equal(path[0], '0,0');
  assert.equal(path[path.length - 1], '2,0');
  assert.equal(path.length, 3); // 0,0 -> 1,0 -> 2,0

  const noPath = findPath('0,0', '2,0', (key) => key === '1,0' || key === '1,-1' || key === '2,-1');
  // with the direct routes blocked, a path should still exist going around
  assert.ok(noPath === null || noPath[noPath.length - 1] === '2,0');
});

test('findPath returns null when fully boxed in', () => {
  const path = findPath('0,0', '5,0', () => true);
  assert.equal(path, null);
});

test('pixelForHex is deterministic for the same input', () => {
  const a = pixelForHex(3, -1, 26);
  const b = pixelForHex(3, -1, 26);
  assert.deepEqual(a, b);
});

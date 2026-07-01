import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateMap, pickNestSites } from '../js/mapgen.js';

test('generateMap is deterministic for the same seed', () => {
  const a = generateMap(12345, 8);
  const b = generateMap(12345, 8);
  assert.deepEqual(a, b);
});

test('generateMap differs for different seeds (not a constant map)', () => {
  const a = generateMap(1, 8);
  const b = generateMap(2, 8);
  assert.notDeepEqual(a, b);
});

test('generateMap produces only valid terrain and resource types', () => {
  const map = generateMap(42, 8);
  const validTerrain = new Set(['soil', 'water', 'rock']);
  const validResource = new Set(['sugar', 'protein', 'mineral']);
  for (const tile of Object.values(map.tiles)) {
    assert.ok(validTerrain.has(tile.terrain));
    if (tile.resourceNode) assert.ok(validResource.has(tile.resourceNode.type));
  }
});

test('pickNestSites returns the requested count of distinct, resource-free soil tiles', () => {
  const map = generateMap(99, 8);
  const sites = pickNestSites(map, 3);
  assert.equal(sites.length, 3);
  assert.equal(new Set(sites).size, 3, 'nest sites must be distinct tiles');
  for (const key of sites) {
    const tile = map.tiles[key];
    assert.equal(tile.terrain, 'soil');
    assert.equal(tile.resourceNode, null);
  }
});

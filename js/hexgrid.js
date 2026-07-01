const DIRECTIONS = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
];

export function keyOf(q, r) {
  return `${q},${r}`;
}

export function parseKey(key) {
  const [q, r] = key.split(',').map(Number);
  return { q, r };
}

export function neighbors(q, r) {
  return DIRECTIONS.map((d) => ({ q: q + d.q, r: r + d.r }));
}

export function hexDistance(a, b) {
  const as = -a.q - a.r;
  const bs = -b.q - b.r;
  return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(as - bs));
}

export function tilesInRadius(radius) {
  const results = [];
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) {
      results.push({ q, r });
    }
  }
  return results;
}

// Breadth-first shortest path between two tile keys, avoiding blocked tiles.
export function findPath(startKey, endKey, isBlocked) {
  if (startKey === endKey) return [startKey];

  const visited = new Set([startKey]);
  const cameFrom = new Map();
  const queue = [startKey];
  let qi = 0;

  while (qi < queue.length) {
    const currentKey = queue[qi++];
    const { q, r } = parseKey(currentKey);

    for (const n of neighbors(q, r)) {
      const nKey = keyOf(n.q, n.r);
      if (visited.has(nKey) || isBlocked(nKey)) continue;

      visited.add(nKey);
      cameFrom.set(nKey, currentKey);

      if (nKey === endKey) {
        const path = [nKey];
        let cur = nKey;
        while (cur !== startKey) {
          cur = cameFrom.get(cur);
          path.push(cur);
        }
        return path.reverse();
      }
      queue.push(nKey);
    }
  }
  return null;
}

// Flat-top axial layout.
export function pixelForHex(q, r, size) {
  const x = size * (1.5 * q);
  const y = size * ((Math.sqrt(3) / 2) * q + Math.sqrt(3) * r);
  return { x, y };
}

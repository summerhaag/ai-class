import { solveOtherRoot } from './descartes.js';
import { MaxHeap } from './heap.js';

const DEFAULT_CONSTANTS = {
  MIN_PIXEL_RADIUS: 0.75,
  VIEWPORT_MARGIN: 0.25,
  TIME_BUDGET_MS: 9,
  MAX_FRONTIERS_HARD_CAP: 30000,
  MATERIALIZED_CACHE_CAP: 200000,
  EVICT_TRIGGER: 180000,
  MIN_EVICTION_DEPTH: 8,
};

function circleBBox(c) {
  if (c.k === 0) return { minX: -Infinity, maxX: Infinity, minY: -Infinity, maxY: Infinity };
  const r = Math.abs(1 / c.k);
  return { minX: c.x - r, maxX: c.x + r, minY: c.y - r, maxY: c.y + r };
}

function unionBBox(a, b) {
  return {
    minX: Math.min(a.minX, b.minX),
    maxX: Math.max(a.maxX, b.maxX),
    minY: Math.min(a.minY, b.minY),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

function tripleBBox([a, b, c]) {
  return unionBBox(unionBBox(circleBBox(a), circleBBox(b)), circleBBox(c));
}

function bboxIntersects(a, b) {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

// Lazily materializes the Apollonian gasket, driven by the current viewport
// and zoom level. Once a circle is computed it stays cached for the rest of
// the session (subject to the eviction policy below) — we're revealing more
// of a fixed fractal, not regenerating it.
//
// Frontiers are kept in a max-heap ordered by candidate world-space radius
// (computed once, when the frontier is created) rather than an arbitrary
// queue order. This matters whenever there's more work than fits in a
// budget (a per-frame time slice, or eagerGenerate's count cap): always
// expanding the largest/most visually significant gap first means the
// biggest, most noticeable holes get filled before budget is spent on fine
// detail elsewhere.
export class GasketTree {
  constructor(seed, initialFrontiers, constants = {}) {
    this.constants = { ...DEFAULT_CONSTANTS, ...constants };
    this.materialized = new Map();
    for (const c of seed.circles) {
      c.lastSeenFrame = 0;
      this.materialized.set(c.id, c);
    }
    this.nextId = seed.nextId;
    this.heap = new MaxHeap();
    for (const f of initialFrontiers) {
      this._pushFrontier(f.triple[0], f.triple[1], f.triple[2], f.excluded, f.depth);
    }
  }

  _pushFrontier(c1, c2, c3, excluded, depth) {
    const candidate = solveOtherRoot([c1, c2, c3], excluded);
    const candidateRadius = Math.abs(1 / candidate.k);
    this.heap.push({
      triple: [c1, c2, c3],
      excluded,
      depth,
      candidate,
      candidateRadius,
      priority: candidateRadius,
    });
  }

  // Expands frontiers largest-first, bounded by a time budget and a hard
  // iteration cap. Because the heap is ordered by world-space radius, and
  // screen radius is world radius * zoomScale at a fixed zoom, the pixel-size
  // check is monotonic: as soon as the single largest remaining candidate is
  // too small on screen, every smaller one is too — safe to stop entirely
  // rather than keep scanning. The viewport check isn't monotonic (a big
  // circle can be off-screen while a smaller one elsewhere is in view), so
  // viewport-failing frontiers are set aside and restored after the pass
  // rather than treated as a stop condition.
  expand(viewportBounds, zoomScale, frame) {
    const C = this.constants;
    const start = performance.now();
    const skipped = [];
    let processed = 0;
    let materializedCount = 0;
    let timedOut = false;

    while (this.heap.size > 0) {
      if (processed >= C.MAX_FRONTIERS_HARD_CAP) break;
      if (performance.now() - start >= C.TIME_BUDGET_MS) {
        timedOut = true;
        break;
      }

      const top = this.heap.peek();
      const screenRadius = top.candidateRadius * zoomScale;
      if (screenRadius < C.MIN_PIXEL_RADIUS) break;

      this.heap.pop();
      processed++;

      const parentBBox = tripleBBox(top.triple);
      if (!bboxIntersects(parentBBox, viewportBounds)) {
        skipped.push(top);
        continue;
      }

      const circle = {
        id: this.nextId++,
        k: top.candidate.k,
        x: top.candidate.x,
        y: top.candidate.y,
        depth: top.depth,
        lastSeenFrame: frame,
      };
      this.materialized.set(circle.id, circle);
      materializedCount++;

      const [a, b, c] = top.triple;
      this._pushFrontier(a, b, circle, c, top.depth + 1);
      this._pushFrontier(b, c, circle, a, top.depth + 1);
      this._pushFrontier(c, a, circle, b, top.depth + 1);
    }

    for (const s of skipped) this.heap.push(s);

    if (this.materialized.size > C.EVICT_TRIGGER) {
      this._evict();
    }

    return {
      materializedCount,
      hasMoreWork: materializedCount > 0 || timedOut || (this.heap.size > 0 && processed >= C.MAX_FRONTIERS_HARD_CAP),
    };
  }

  // One-shot, unconditional (no pixel-size/viewport check) materialization,
  // used to give a dense initial view right when a quadruple is generated or
  // the density controls change. Largest-first via the same heap, so a
  // limited count budget is spent on the biggest/most visible gaps first
  // instead of being spread uniformly across branches regardless of size.
  // Bypasses the per-frame time budget deliberately — the count-cap UI
  // control keeps this bounded instead. Frontiers beyond maxDepth are left
  // untouched in the heap for the normal lazy expand() to pick up later.
  eagerGenerate(maxDepth, maxCount, frame) {
    const skipped = [];
    let generated = 0;

    while (this.heap.size > 0 && generated < maxCount) {
      const top = this.heap.pop();
      if (top.depth > maxDepth) {
        skipped.push(top);
        continue;
      }

      const circle = {
        id: this.nextId++,
        k: top.candidate.k,
        x: top.candidate.x,
        y: top.candidate.y,
        depth: top.depth,
        lastSeenFrame: frame,
      };
      this.materialized.set(circle.id, circle);
      generated++;

      const [a, b, c] = top.triple;
      this._pushFrontier(a, b, circle, c, top.depth + 1);
      this._pushFrontier(b, c, circle, a, top.depth + 1);
      this._pushFrontier(c, a, circle, b, top.depth + 1);
    }

    for (const s of skipped) this.heap.push(s);

    if (this.materialized.size > this.constants.EVICT_TRIGGER) {
      this._evict();
    }

    return { generated };
  }

  _evict() {
    const C = this.constants;
    const target = Math.floor(C.MATERIALIZED_CACHE_CAP * 0.8);
    let remaining = this.materialized.size;
    if (remaining <= target) return;

    const candidates = [];
    for (const c of this.materialized.values()) {
      if (c.depth > C.MIN_EVICTION_DEPTH) candidates.push(c);
    }
    candidates.sort((a, b) => a.lastSeenFrame - b.lastSeenFrame);

    const toEvict = new Set();
    for (const c of candidates) {
      if (remaining <= target) break;
      toEvict.add(c.id);
      remaining--;
    }
    if (toEvict.size === 0) return;

    for (const id of toEvict) this.materialized.delete(id);
    this.heap.removeWhere((f) => f.triple.some((c) => toEvict.has(c.id)) || toEvict.has(f.excluded.id));
  }
}

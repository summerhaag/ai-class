import Decimal from 'decimal.js';
import { solveOtherRoot } from './decimal-descartes.js';
import { MaxHeap } from './heap.js';

const DEFAULT_CONSTANTS = {
  MIN_PIXEL_RADIUS: 0.75,
  VIEWPORT_MARGIN: 0.25,
  TIME_BUDGET_MS: 12,
  MAX_FRONTIERS_HARD_CAP: 6000,
  MATERIALIZED_CACHE_CAP: 60000,
  EVICT_TRIGGER: 55000,
  MIN_EVICTION_DEPTH: 8,
};

function circleBBox(c) {
  if (c.k.isZero()) return { minX: new Decimal(-Infinity), maxX: new Decimal(Infinity), minY: new Decimal(-Infinity), maxY: new Decimal(Infinity) };
  const r = c.k.abs().pow(-1);
  return { minX: c.x.minus(r), maxX: c.x.plus(r), minY: c.y.minus(r), maxY: c.y.plus(r) };
}

function unionBBox(a, b) {
  return {
    minX: Decimal.min(a.minX, b.minX),
    maxX: Decimal.max(a.maxX, b.maxX),
    minY: Decimal.min(a.minY, b.minY),
    maxY: Decimal.max(a.maxY, b.maxY),
  };
}

function tripleBBox([a, b, c]) {
  return unionBBox(unionBBox(circleBBox(a), circleBBox(b)), circleBBox(c));
}

function bboxIntersects(a, b) {
  return !(a.maxX.lt(b.minX) || a.minX.gt(b.maxX) || a.maxY.lt(b.minY) || a.minY.gt(b.maxY));
}

// Arbitrary-precision counterpart to gasket.js's GasketTree — same lazy,
// viewport/zoom-driven, largest-first (max-heap) generation strategy, but
// every circle field and every bbox/viewport comparison is a Decimal, so the
// "candidate too small to matter" cutoff stays correct arbitrarily deep
// instead of being limited by float64's ~1e12-1e15 usable dynamic range.
//
// Heap priority can't just be the Decimal radius (Number(tinyDecimal)
// underflows to 0 once you're many generations deep, collapsing the ordering
// among all the tiny candidates that matter most). Instead it uses the
// Decimal's own base-10 exponent (.e, a plain JS integer decimal.js already
// tracks internally) — cheap, monotonic with magnitude across the entire
// representable range, and exact enough for "expand the biggest gap first."
const constants = { ...DEFAULT_CONSTANTS };

function priorityOf(radius, isLine) {
  return isLine ? Infinity : radius.e;
}

export class GasketTree {
  constructor(seed, initialFrontiers, overrides = {}) {
    this.constants = { ...constants, ...overrides };
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
    const isLine = candidate.k.isZero();
    const candidateRadius = isLine ? new Decimal(Infinity) : candidate.k.abs().pow(-1);
    this.heap.push({
      triple: [c1, c2, c3],
      excluded,
      depth,
      candidate,
      candidateRadius,
      priority: priorityOf(candidateRadius, isLine),
    });
  }

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
      const screenRadius = top.candidateRadius.times(zoomScale);
      if (screenRadius.lt(C.MIN_PIXEL_RADIUS)) break;

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

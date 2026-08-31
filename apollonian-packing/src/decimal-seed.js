import Decimal from 'decimal.js';

// Decimal counterpart to seed.js. Same symmetric configuration (outer k=-1,
// three equal inner circles), but the inner curvature and the three centers
// are derived from a single Decimal sqrt(3) computed at the configured
// precision, rather than double's Math.sqrt(3) — so the seed itself starts
// with no more rounding error than the recursion built on top of it.
//
// The three inner centers sit at angles 90/210/330 degrees; rather than call
// into Decimal's trig functions, their cos/sin have simple exact closed forms
// in terms of the same sqrt(3) already computed for innerK, which is more
// precise (one sqrt, reused) and avoids depending on decimal.js's trig
// implementation for something this simple:
//   90°:  (0, 1)          210°: (-√3/2, -1/2)   330°: (√3/2, -1/2)
export function buildSeedQuadruple() {
  const sqrt3 = new Decimal(3).sqrt();
  const outerK = new Decimal(-1);
  const innerK = new Decimal(1).plus(sqrt3.times(2).div(3));
  const r = new Decimal(1).div(innerK);
  const d = r.times(2).div(sqrt3);
  const half = d.div(2);
  const halfSqrt3 = d.times(sqrt3).div(2);

  const outer = { id: 0, k: outerK, x: new Decimal(0), y: new Decimal(0), depth: 0 };
  const inner = [
    { x: new Decimal(0), y: d },
    { x: halfSqrt3.neg(), y: half.neg() },
    { x: halfSqrt3, y: half.neg() },
  ].map((pos, i) => ({ id: i + 1, k: innerK, x: pos.x, y: pos.y, depth: 0 }));

  return { circles: [outer, ...inner], nextId: 4 };
}

import Decimal from 'decimal.js';

// Arbitrary-precision counterpart to descartes.js. Same formulas, same
// circle/line representation ({k,x,y} or {k:0,x,y,nx,ny}) — every field is
// now a Decimal instead of a JS number, computed to whatever precision the
// caller configured via Decimal.set({precision}). The recursive step
// (solveOtherRoot) is pure +-*/ with no sqrt, so it carries zero additional
// rounding error per generation beyond what the configured precision itself
// rounds off — that's what buys the extra zoom depth over the float64 path.
const K_ZERO_EPS = new Decimal('1e-30');

function curvatureCenter(c) {
  return c.k.isZero() ? { x: c.nx, y: c.ny } : { x: c.k.times(c.x), y: c.k.times(c.y) };
}

function circleOrLine(k, bx, by, tangentTo) {
  if (k.abs().gte(K_ZERO_EPS)) {
    return { k, x: bx.div(k), y: by.div(k) };
  }
  const mag = Decimal.hypot(bx, by).isZero() ? new Decimal(1) : Decimal.hypot(bx, by);
  const nx = bx.div(mag);
  const ny = by.div(mag);
  const real = tangentTo.find((m) => !m.k.isZero());
  const x = real ? real.x.plus(nx.div(real.k)) : new Decimal(0);
  const y = real ? real.y.plus(ny.div(real.k)) : new Decimal(0);
  return { k: new Decimal(0), x, y, nx, ny };
}

export function solveOtherRoot(triple, excluded) {
  const [a, b, c] = triple;
  const kSum = a.k.plus(b.k).plus(c.k);
  const k = kSum.times(2).minus(excluded.k);

  const muA = curvatureCenter(a);
  const muB = curvatureCenter(b);
  const muC = curvatureCenter(c);
  const muE = curvatureCenter(excluded);

  const bx = muA.x.plus(muB.x).plus(muC.x).times(2).minus(muE.x);
  const by = muA.y.plus(muB.y).plus(muC.y).times(2).minus(muE.y);

  return circleOrLine(k, bx, by, [a, b, c, excluded]);
}

// Complex helpers for the seed-time quadratic solve, mirroring descartes.js's
// but over Decimal instead of Number.
const cMul = (a, b) => ({ re: a.re.times(b.re).minus(a.im.times(b.im)), im: a.re.times(b.im).plus(a.im.times(b.re)) });
const cAdd = (a, b) => ({ re: a.re.plus(b.re), im: a.im.plus(b.im) });
const cScale = (a, s) => ({ re: a.re.times(s), im: a.im.times(s) });
function cSqrt(a) {
  const r = Decimal.hypot(a.re, a.im);
  const re = r.plus(a.re).div(2).sqrt();
  const imMag = r.minus(a.re).div(2).sqrt();
  const sign = a.im.isNegative() ? -1 : 1;
  return { re, im: imMag.times(sign) };
}

// Used once, at seed-construction time, to place a custom quadruple — see
// descartes.js's solveQuadraticRoots for the derivation/rationale.
export function solveQuadraticRoots(triple) {
  const [c1, c2, c3] = triple;
  const kSum = c1.k.plus(c2.k).plus(c3.k);
  const kCross = c1.k.times(c2.k).plus(c2.k.times(c3.k)).plus(c3.k.times(c1.k));
  const kDelta = Decimal.max(kCross, 0).sqrt().times(2);

  const muA = curvatureCenter(c1);
  const muB = curvatureCenter(c2);
  const muC = curvatureCenter(c3);
  const w1 = { re: muA.x, im: muA.y };
  const w2 = { re: muB.x, im: muB.y };
  const w3 = { re: muC.x, im: muC.y };

  const wSum = cAdd(cAdd(w1, w2), w3);
  const cross = cAdd(cAdd(cMul(w1, w2), cMul(w2, w3)), cMul(w3, w1));
  const wDelta = cScale(cSqrt(cross), 2);

  const kPlus = kSum.plus(kDelta);
  const kMinus = kSum.minus(kDelta);
  const wPlus = cAdd(wSum, wDelta);
  const wMinus = { re: wSum.re.minus(wDelta.re), im: wSum.im.minus(wDelta.im) };

  return [
    circleOrLine(kPlus, wPlus.re, wPlus.im, triple),
    circleOrLine(kMinus, wMinus.re, wMinus.im, triple),
  ];
}

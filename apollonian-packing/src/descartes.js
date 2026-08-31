// Descartes Circle Theorem math. Circles are plain objects {k, x, y}:
// k = curvature (1/radius, negative for an enclosing/internally-tangent circle),
// (x, y) = center. Centers are treated as 2D vectors (not full complex numbers)
// for the linear recurrence below, since it only needs real-scalar operations.
//
// A circle of curvature 0 is a straight line — it has no center, so it's
// represented instead as {k: 0, x, y, nx, ny} where (x, y) is any one point
// on the line and (nx, ny) is a unit normal. This (nx, ny) doubles as the
// line's "curvature-center" value: the k*z term used throughout this file's
// formulas is the limit, as a circle's radius R -> Infinity and its center
// recedes along a fixed direction n, of (1/R)*(center) -> n. So a line's
// (nx, ny) simply substitutes for a real circle's k*(x, y) everywhere below.
const K_ZERO_EPS = 1e-9;

function curvatureCenter(c) {
  return c.k === 0 ? { x: c.nx, y: c.ny } : { x: c.k * c.x, y: c.k * c.y };
}

// Given the "curvature-center" value (bx, by) for the 4th (target) circle and
// its curvature k, build either a real circle or, if k is ~0, a line. In the
// line case, a point on it is recovered from any *real* circle among the
// tangent triple via T = center + (1/k)*(nx, ny) — the point where that
// circle's boundary touches the line.
function circleOrLine(k, bx, by, tangentTo) {
  if (Math.abs(k) >= K_ZERO_EPS) {
    return { k, x: bx / k, y: by / k };
  }
  const mag = Math.hypot(bx, by) || 1;
  const nx = bx / mag;
  const ny = by / mag;
  const real = tangentTo.find((m) => m.k !== 0);
  const x = real ? real.x + nx / real.k : 0;
  const y = real ? real.y + ny / real.k : 0;
  return { k: 0, x, y, nx, ny };
}

// Cheap path: given a complete, valid mutually-tangent quadruple where
// (triple[0], triple[1], triple[2], excluded) are all tangent to each other,
// return the *other* circle tangent to triple (Vieta's formula, no sqrt).
export function solveOtherRoot(triple, excluded) {
  const [a, b, c] = triple;
  const kSum = a.k + b.k + c.k;
  const k = 2 * kSum - excluded.k;

  const muA = curvatureCenter(a);
  const muB = curvatureCenter(b);
  const muC = curvatureCenter(c);
  const muE = curvatureCenter(excluded);

  const bx = 2 * (muA.x + muB.x + muC.x) - muE.x;
  const by = 2 * (muA.y + muB.y + muC.y) - muE.y;

  return circleOrLine(k, bx, by, [a, b, c, excluded]);
}

// Complex helpers, used only by the seed-time quadratic solve below.
const cMul = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const cAdd = (a, b) => ({ re: a.re + b.re, im: a.im + b.im });
const cScale = (a, s) => ({ re: a.re * s, im: a.im * s });
function cSqrt(a) {
  const r = Math.hypot(a.re, a.im);
  const re = Math.sqrt((r + a.re) / 2);
  const im = Math.sign(a.im || 1) * Math.sqrt((r - a.re) / 2);
  return { re, im };
}

// Full quadratic solve: given a mutually tangent triple, return both roots
// {k, x, y} for the 4th tangent circle. Used once, at seed-construction time,
// where no pre-existing 4th circle is available to drive the cheap recurrence.
//
// Uses curvature-centers (w = k*center, or a line's unit normal in place of
// that product) throughout, not raw centers — a line's center coordinate is
// just one arbitrary point on it and carries no tangency information by
// itself, only (nx, ny) does. Building the cross term from raw centers
// degenerates to zero whenever a line is involved (its k=0 factor wipes out
// the term instead of contributing its direction), which was fine when this
// function only ever saw real circles but silently produced a duplicate root
// once lines entered the triple.
export function solveQuadraticRoots(triple) {
  const [c1, c2, c3] = triple;
  const kSum = c1.k + c2.k + c3.k;
  const kCross = c1.k * c2.k + c2.k * c3.k + c3.k * c1.k;
  const kDelta = 2 * Math.sqrt(Math.max(kCross, 0));

  const muA = curvatureCenter(c1);
  const muB = curvatureCenter(c2);
  const muC = curvatureCenter(c3);
  const w1 = { re: muA.x, im: muA.y };
  const w2 = { re: muB.x, im: muB.y };
  const w3 = { re: muC.x, im: muC.y };

  const wSum = cAdd(cAdd(w1, w2), w3);
  const cross = cAdd(cAdd(cMul(w1, w2), cMul(w2, w3)), cMul(w3, w1));
  const wDelta = cScale(cSqrt(cross), 2);

  const kPlus = kSum + kDelta;
  const kMinus = kSum - kDelta;
  const wPlus = cAdd(wSum, wDelta);
  const wMinus = { re: wSum.re - wDelta.re, im: wSum.im - wDelta.im };

  return [
    circleOrLine(kPlus, wPlus.re, wPlus.im, triple),
    circleOrLine(kMinus, wMinus.re, wMinus.im, triple),
  ];
}

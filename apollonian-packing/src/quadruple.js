import { solveQuadraticRoots } from './descartes.js';

const IDENTITY_TOLERANCE = 1e-6;

// Checks the Descartes Circle Theorem identity for 4 curvatures. Returns
// {valid:true} or {valid:false, error} with a user-facing message.
export function validateQuadruple(k1, k2, k3, k4) {
  if ([k1, k2, k3, k4].some((k) => !Number.isFinite(k))) {
    return { valid: false, error: 'All four curvatures must be numbers.' };
  }
  if ([k1, k2, k3, k4].filter((k) => k === 0).length > 2) {
    return { valid: false, error: 'At most two curvatures may be 0 (need at least two genuine circles).' };
  }
  const sum = k1 + k2 + k3 + k4;
  const sqSum = k1 * k1 + k2 * k2 + k3 * k3 + k4 * k4;
  const lhs = sum * sum;
  const rhs = 2 * sqSum;
  const scale = Math.max(1, Math.abs(rhs));
  if (Math.abs(lhs - rhs) > IDENTITY_TOLERANCE * scale) {
    return {
      valid: false,
      error: `Doesn't satisfy Descartes' Circle Theorem: (k1+k2+k3+k4)^2 = ${lhs.toFixed(4)}, but 2*(k1^2+k2^2+k3^2+k4^2) = ${rhs.toFixed(4)}.`,
    };
  }
  return { valid: true };
}

function permutations3([a, b, c]) {
  return [
    [a, b, c],
    [a, c, b],
    [b, a, c],
    [b, c, a],
    [c, a, b],
    [c, b, a],
  ];
}

// Places 3 mutually tangent circles from curvatures alone, using the signed-
// radius tangency identity dist(i,j) = |1/ki + 1/kj|. Returns a dimensionless
// `score` (~sin^2 of the triangle's angle at c1) so callers can compare
// conditioning against the line-inclusive placements below on the same
// [0,1]-ish scale: near 0 means near-degenerate/collinear, negative means no
// real placement exists.
function placeTripleCircles(k1, k2, k3) {
  const r1 = 1 / k1;
  const r2 = 1 / k2;
  const r3 = 1 / k3;
  const c1 = { k: k1, x: 0, y: 0 };
  const dAB = Math.abs(r1 + r2);
  const c2 = { k: k2, x: dAB, y: 0 };
  const dAC = Math.abs(r1 + r3);
  const dBC = Math.abs(r2 + r3);
  const a = (dAC * dAC - dBC * dBC + dAB * dAB) / (2 * dAB);
  const hSq = dAC * dAC - a * a;
  const c3 = { k: k3, x: a, y: Math.sqrt(Math.max(hSq, 0)) };
  const score = hSq / Math.max(dAC * dAC, 1e-300);
  return { c1, c2, c3, score };
}

// Places 2 mutually tangent real circles plus a straight line (curvature 0)
// tangent to both from the same side — the bootstrap for a "half-plane"
// quadruple. The two circles sit on the x-axis as in placeTripleCircles; the
// line's unit normal (nx, ny) is fixed by requiring its two tangent points
// (each circle's center offset by its own radius along the normal) to be
// collinear. `nx,ny` follows the convention used throughout descartes.js:
// it points from a tangent circle's center toward the line.
function placeCircleCircleLine(kp, kq) {
  const rp = 1 / kp;
  const rq = 1 / kq;
  const d = Math.abs(rp + rq);
  const cp = { k: kp, x: 0, y: 0 };
  const cq = { k: kq, x: d, y: 0 };
  const nx = (rp - rq) / d;
  const score = 1 - nx * nx;
  const ny = -Math.sqrt(Math.max(score, 0)); // line below both circles
  const line = { k: 0, x: cp.x + rp * nx, y: cp.y + rp * ny, nx, ny };
  return { cp, cq, line, score };
}

// Places 1 real circle plus two parallel lines tangent to it from opposite
// sides — the bootstrap for a "strip" quadruple. Always well-conditioned
// (score fixed at 1) since there's no permutation-dependent degeneracy here.
function placeCircleTwoLines(kc) {
  const rc = 1 / kc;
  const circle = { k: kc, x: 0, y: 0 };
  const lineA = { k: 0, x: 0, y: -rc, nx: 0, ny: -1 };
  const lineB = { k: 0, x: 0, y: rc, nx: 0, ny: 1 };
  return { circle, lineA, lineB, score: 1 };
}

// Places any mutually-tangent triple of curvatures, dispatching on how many
// of the three are 0 (a straight line) rather than a genuine circle. A valid
// quadruple has at most 2 zero curvatures (enforced by validateQuadruple), so
// a 3-subset of it can never have all three be lines.
function placeTriple(ka, kb, kc) {
  const ks = [ka, kb, kc];
  const zeroIdx = [0, 1, 2].filter((i) => ks[i] === 0);

  if (zeroIdx.length === 0) {
    return placeTripleCircles(ka, kb, kc);
  }

  if (zeroIdx.length === 1) {
    const [lineSlot] = zeroIdx;
    const others = [0, 1, 2].filter((i) => i !== lineSlot);
    const { cp, cq, line, score } = placeCircleCircleLine(ks[others[0]], ks[others[1]]);
    const slots = [null, null, null];
    slots[others[0]] = cp;
    slots[others[1]] = cq;
    slots[lineSlot] = line;
    return { c1: slots[0], c2: slots[1], c3: slots[2], score };
  }

  const circleSlot = [0, 1, 2].find((i) => !zeroIdx.includes(i));
  const { circle, lineA, lineB, score } = placeCircleTwoLines(ks[circleSlot]);
  const slots = [null, null, null];
  slots[circleSlot] = circle;
  slots[zeroIdx[0]] = lineA;
  slots[zeroIdx[1]] = lineB;
  return { c1: slots[0], c2: slots[1], c3: slots[2], score };
}

// Builds a full mutually-tangent quadruple from 4 curvatures. Rather than
// always placing (k1,k2,k3) and solving for k4 — which is fragile whenever
// that particular 3-subset is geometrically degenerate (e.g. two circles of
// equal curvature both tangent to a third are forced collinear, independent
// of ordering) — this searches over which of the 4 curvatures to solve for,
// keeping whichever choice is best-conditioned (highest score; see
// placeTriple).
export function placeQuadruple(k1, k2, k3, k4) {
  const validation = validateQuadruple(k1, k2, k3, k4);
  if (!validation.valid) return validation;

  const ks = [k1, k2, k3, k4];
  let best = null;

  for (let drop = 0; drop < 4; drop++) {
    const rest = ks.filter((_, i) => i !== drop);
    const target = ks[drop];
    for (const [a, b, c] of permutations3(rest)) {
      const p = placeTriple(a, b, c);
      if (!p || !Number.isFinite(p.score)) continue;
      if (best === null || p.score > best.score) {
        best = { ...p, drop, target };
      }
    }
  }

  if (best === null || best.score < -1e-6) {
    return { valid: false, error: 'These curvatures cannot form a real mutually tangent quadruple.' };
  }

  const [rootA, rootB] = solveQuadraticRoots([best.c1, best.c2, best.c3]);
  const chosen = Math.abs(rootA.k - best.target) <= Math.abs(rootB.k - best.target) ? rootA : rootB;
  const solved =
    best.target === 0
      ? { k: 0, x: chosen.x, y: chosen.y, nx: chosen.nx, ny: chosen.ny }
      : { k: best.target, x: chosen.x, y: chosen.y };

  // Draw order (Map insertion order in GasketTree) follows this array, so
  // the largest circle must come first — otherwise a big enclosing circle
  // assembled after its smaller siblings would paint over them, since every
  // circle in this array is drawn as a solid disk before any of its own
  // (smaller, nested) children exist to be drawn on top.
  const circles = [best.c1, best.c2, best.c3, solved].sort(
    (a, b) => Math.abs(1 / b.k) - Math.abs(1 / a.k)
  );
  circles.forEach((c, i) => {
    c.id = i;
    c.depth = 0;
  });

  return { valid: true, circles, nextId: 4 };
}

// Every triple among 4 mutually tangent circles spawns one new circle in its
// gap — works for any valid quadruple, not just the symmetric default.
export function buildInitialFrontiers(circles) {
  const [c0, c1, c2, c3] = circles;
  return [
    { triple: [c1, c2, c3], excluded: c0, depth: 1 },
    { triple: [c0, c2, c3], excluded: c1, depth: 1 },
    { triple: [c0, c1, c3], excluded: c2, depth: 1 },
    { triple: [c0, c1, c2], excluded: c3, depth: 1 },
  ];
}

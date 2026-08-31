import Decimal from 'decimal.js';
import { validateQuadruple } from './quadruple.js';
import { solveQuadraticRoots } from './decimal-descartes.js';

// Arbitrary-precision counterpart to quadruple.js's placement logic. Input
// curvatures still arrive as plain JS numbers (whatever precision the user's
// typed expression evaluated to via expr.js — that's an inherent limit of
// float64 text input, not something this module can improve on), but they're
// promoted to Decimal immediately and every geometric placement from there on
// — including the sqrt calls — runs at the configured Decimal precision, so
// the seed itself carries as little rounding error as the recursion that
// follows it.
//
// validateQuadruple (the Descartes-identity sanity check on raw input) is
// reused as-is from quadruple.js: it's a UX check on numbers the user just
// typed, not part of the precision-critical recursion.
export { validateQuadruple };

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

function placeTripleCircles(k1, k2, k3) {
  const r1 = new Decimal(1).div(k1);
  const r2 = new Decimal(1).div(k2);
  const r3 = new Decimal(1).div(k3);
  const c1 = { k: k1, x: new Decimal(0), y: new Decimal(0) };
  const dAB = r1.plus(r2).abs();
  const c2 = { k: k2, x: dAB, y: new Decimal(0) };
  const dAC = r1.plus(r3).abs();
  const dBC = r2.plus(r3).abs();
  const a = dAC.times(dAC).minus(dBC.times(dBC)).plus(dAB.times(dAB)).div(dAB.times(2));
  const hSq = dAC.times(dAC).minus(a.times(a));
  const c3 = { k: k3, x: a, y: Decimal.max(hSq, 0).sqrt() };
  const score = hSq.div(Decimal.max(dAC.times(dAC), '1e-300'));
  return { c1, c2, c3, score };
}

function placeCircleCircleLine(kp, kq) {
  const rp = new Decimal(1).div(kp);
  const rq = new Decimal(1).div(kq);
  const d = rp.plus(rq).abs();
  const cp = { k: kp, x: new Decimal(0), y: new Decimal(0) };
  const cq = { k: kq, x: d, y: new Decimal(0) };
  const nx = rp.minus(rq).div(d);
  const score = new Decimal(1).minus(nx.times(nx));
  const ny = Decimal.max(score, 0).sqrt().neg();
  const line = { k: new Decimal(0), x: cp.x.plus(rp.times(nx)), y: cp.y.plus(rp.times(ny)), nx, ny };
  return { cp, cq, line, score };
}

function placeCircleTwoLines(kc) {
  const rc = new Decimal(1).div(kc);
  const circle = { k: kc, x: new Decimal(0), y: new Decimal(0) };
  const lineA = { k: new Decimal(0), x: new Decimal(0), y: rc.neg(), nx: new Decimal(0), ny: new Decimal(-1) };
  const lineB = { k: new Decimal(0), x: new Decimal(0), y: rc, nx: new Decimal(0), ny: new Decimal(1) };
  return { circle, lineA, lineB, score: new Decimal(1) };
}

function placeTriple(ka, kb, kc) {
  const ks = [ka, kb, kc];
  const zeroIdx = [0, 1, 2].filter((i) => ks[i].isZero());

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

export function placeQuadruple(k1, k2, k3, k4) {
  const validation = validateQuadruple(k1, k2, k3, k4);
  if (!validation.valid) return validation;

  const ks = [k1, k2, k3, k4].map((k) => new Decimal(k));
  let best = null;

  for (let drop = 0; drop < 4; drop++) {
    const rest = ks.filter((_, i) => i !== drop);
    const target = ks[drop];
    for (const [a, b, c] of permutations3(rest)) {
      const p = placeTriple(a, b, c);
      if (!p || !p.score.isFinite()) continue;
      if (best === null || p.score.gt(best.score)) {
        best = { ...p, drop, target };
      }
    }
  }

  if (best === null || best.score.lt(-1e-6)) {
    return { valid: false, error: 'These curvatures cannot form a real mutually tangent quadruple.' };
  }

  const [rootA, rootB] = solveQuadraticRoots([best.c1, best.c2, best.c3]);
  const chosen = rootA.k.minus(best.target).abs().lte(rootB.k.minus(best.target).abs()) ? rootA : rootB;
  const solved = best.target.isZero()
    ? { k: new Decimal(0), x: chosen.x, y: chosen.y, nx: chosen.nx, ny: chosen.ny }
    : { k: best.target, x: chosen.x, y: chosen.y };

  // Same draw-order rationale as quadruple.js: largest circle first so it
  // doesn't paint over its own (smaller, nested) children.
  const circles = [best.c1, best.c2, best.c3, solved].sort((a, b) =>
    b.k.abs().pow(-1).minus(a.k.abs().pow(-1)).toNumber()
  );
  circles.forEach((c, i) => {
    c.id = i;
    c.depth = 0;
  });

  return { valid: true, circles, nextId: 4 };
}

export function buildInitialFrontiers(circles) {
  const [c0, c1, c2, c3] = circles;
  return [
    { triple: [c1, c2, c3], excluded: c0, depth: 1 },
    { triple: [c0, c2, c3], excluded: c1, depth: 1 },
    { triple: [c0, c1, c3], excluded: c2, depth: 1 },
    { triple: [c0, c1, c2], excluded: c3, depth: 1 },
  ];
}

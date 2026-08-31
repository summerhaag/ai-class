// Heuristically recognizes a real number as p + q*sqrt(c) for small
// half-integer p, q and small squarefree c > 1, purely to produce a nicer
// display label. This is numeric pattern-matching within a tight tolerance
// (an "inverse symbolic calculator" in miniature), not exact symbolic
// tracking of the value through the recursion — with several independent
// irrational seed curvatures in play, true symbolic tracking would need a
// much richer number system than a single quadratic extension.
const SQRT_MAX = 30;
const HALF_COEFF_MAX = 24; // q ranges over multiples of 0.5 up to +/-12
const MAX_COMPLEXITY = 40; // |2p| + |2q| + c, keeps matches simple and readable
// Tight on purpose: curvatures reach this function either as an exact
// integer-combination of the seed values (accurate to float precision, so
// ~1e-13 relative error even many generations deep) or as an arbitrary
// decimal a user typed. A loose tolerance here would "recognize" ordinary
// decimals as bogus surds just because the search space is large enough to
// find something within reach — see the false positives found while tuning
// this against random floats before tightening to 1e-9.
const REL_TOL = 1e-9;

function isSquarefree(n) {
  for (let p = 2; p * p <= n; p++) {
    if (n % (p * p) === 0) return false;
  }
  return true;
}

const SQUAREFREE = [];
for (let c = 2; c <= SQRT_MAX; c++) {
  if (isSquarefree(c)) SQUAREFREE.push(c);
}

function fmtCoeff(n) {
  return Number.isInteger(n) ? String(n) : String(n);
}

const cache = new Map();

// Returns a display string: an integer if k is (very nearly) one, else the
// simplest "p + q*sqrt(c)" match found within tolerance, else a decimal
// fallback prefixed with "~" to signal it's only approximate.
export function niceLabel(k) {
  const key = k.toPrecision(12);
  if (cache.has(key)) return cache.get(key);

  const rounded = Math.round(k);
  if (Math.abs(k - rounded) < REL_TOL * Math.max(1, Math.abs(k))) {
    cache.set(key, String(rounded));
    return String(rounded);
  }

  let best = null;
  const tol = REL_TOL * Math.max(1, Math.abs(k));
  for (const c of SQUAREFREE) {
    const sq = Math.sqrt(c);
    for (let q2 = -HALF_COEFF_MAX; q2 <= HALF_COEFF_MAX; q2++) {
      if (q2 === 0) continue;
      const q = q2 / 2;
      const p2 = Math.round((k - q * sq) * 2);
      const p = p2 / 2;
      const candidate = p + q * sq;
      const complexity = Math.abs(p2) + Math.abs(q2) + c;
      if (complexity <= MAX_COMPLEXITY && Math.abs(candidate - k) < tol) {
        if (!best || complexity < best.complexity) best = { p, q, c, complexity };
      }
    }
  }

  let text;
  if (best) {
    const { p, q, c } = best;
    const sqrtTerm = `${Math.abs(q) === 1 ? '' : fmtCoeff(Math.abs(q))}√${c}`;
    if (p === 0) {
      text = `${q < 0 ? '-' : ''}${sqrtTerm}`;
    } else {
      text = `${fmtCoeff(p)} ${q < 0 ? '-' : '+'} ${sqrtTerm}`;
    }
  } else {
    text = `~${k.toFixed(3)}`;
  }
  cache.set(key, text);
  return text;
}

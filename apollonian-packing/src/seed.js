// Builds the default mutually-tangent quadruple: outer boundary + 3 equal
// inner circles.
//
// Outer circle of radius 1 (k = -1) centered at the origin, with three equal
// mutually-tangent inner circles inscribed inside it. The inner curvature
// solves 3x^2 - 6x - 1 = 0 for the symmetric configuration:
//   x = 1 + 2*sqrt(3)/3
export function buildSeedQuadruple() {
  const outerK = -1;
  const innerK = 1 + (2 * Math.sqrt(3)) / 3;
  const r = 1 / innerK;
  const d = (2 * r) / Math.sqrt(3);

  const outer = { id: 0, k: outerK, x: 0, y: 0, depth: 0 };
  const angles = [90, 210, 330].map((deg) => (deg * Math.PI) / 180);
  const inner = angles.map((a, i) => ({
    id: i + 1,
    k: innerK,
    x: d * Math.cos(a),
    y: d * Math.sin(a),
    depth: 0,
  }));

  return { circles: [outer, ...inner], nextId: 4 };
}

import Decimal from 'decimal.js';
import { niceLabel } from './surd.js';

const GOLDEN_ANGLE = 137.508;
const LABEL_MIN_FONT_PX = 10;

function colorForCircle(c) {
  if (c.k.isNegative()) return '#12121c'; // enclosing boundary: dark background fill
  const hue = (c.depth * GOLDEN_ANGLE) % 360;
  return `hsl(${hue.toFixed(1)} 70% 58%)`;
}

function drawLine(ctx, camera, c) {
  const dirX = c.ny.neg();
  const dirY = c.nx;
  const reach = new Decimal(Math.hypot(camera.width, camera.height)).div(camera.zoomScale).times(2);
  const [sx1, sy1] = camera.worldToScreen(c.x.minus(dirX.times(reach)), c.y.minus(dirY.times(reach)));
  const [sx2, sy2] = camera.worldToScreen(c.x.plus(dirX.times(reach)), c.y.plus(dirY.times(reach)));
  ctx.beginPath();
  ctx.moveTo(sx1, sy1);
  ctx.lineTo(sx2, sy2);
  ctx.strokeStyle = colorForCircle(c);
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawLabel(ctx, c, sx, sy, screenR) {
  // niceLabel does a small combinatorial search for a nice display string —
  // purely cosmetic, so a Number() downcast of an astronomically large/small
  // Decimal curvature is fine here even though it'd be wrong for the math.
  const kNum = c.k.toNumber();
  if (!Number.isFinite(kNum)) return;
  const text = niceLabel(kNum);
  const minRadius = 8 + 6 * text.length;
  if (screenR < minRadius) return;

  const fontSize = Math.max(LABEL_MIN_FONT_PX, Math.min(screenR * 0.5, 28));
  ctx.font = `${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(1, fontSize * 0.12);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.fillStyle = '#fff';
  ctx.strokeText(text, sx, sy);
  ctx.fillText(text, sx, sy);
}

export function draw(gasket, camera, frame, minPixelRadius, options = {}) {
  const { renderMode = 'filled', showLabels = false } = options;
  const ctx = camera.ctx;
  const dpr = camera.dpr;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, camera.width, camera.height);

  const viewport = camera.viewportWorldBounds(0);
  let drawnCount = 0;

  for (const c of gasket.materialized.values()) {
    if (c.k.isZero()) {
      const dist = c.nx.times(camera.centerX.minus(c.x)).plus(c.ny.times(camera.centerY.minus(c.y))).abs();
      const viewportHalfDiag = Decimal.hypot(viewport.maxX.minus(viewport.minX), viewport.maxY.minus(viewport.minY)).div(2);
      if (dist.gt(viewportHalfDiag)) continue;
      c.lastSeenFrame = frame;
      drawnCount++;
      drawLine(ctx, camera, c);
      continue;
    }

    const r = c.k.abs().pow(-1);
    const screenR = r.times(camera.zoomScale);
    if (screenR.lt(minPixelRadius)) continue;
    if (c.x.plus(r).lt(viewport.minX) || c.x.minus(r).gt(viewport.maxX) || c.y.plus(r).lt(viewport.minY) || c.y.minus(r).gt(viewport.maxY)) {
      continue;
    }

    c.lastSeenFrame = frame;
    drawnCount++;

    const [sx, sy] = camera.worldToScreen(c.x, c.y);
    const screenRNum = screenR.toNumber();
    ctx.beginPath();
    ctx.arc(sx, sy, screenRNum, 0, Math.PI * 2);

    if (renderMode === 'outline' && c.k.isPositive()) {
      ctx.strokeStyle = colorForCircle(c);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      ctx.fillStyle = colorForCircle(c);
      ctx.fill();
    }

    if (showLabels) drawLabel(ctx, c, sx, sy, screenRNum);
  }

  return drawnCount;
}

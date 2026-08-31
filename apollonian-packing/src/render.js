const GOLDEN_ANGLE = 137.508;
const LABEL_MIN_FONT_PX = 10;

function colorForCircle(c) {
  if (c.k < 0) return '#12121c'; // enclosing boundary: dark background fill
  const hue = (c.depth * GOLDEN_ANGLE) % 360;
  return `hsl(${hue.toFixed(1)} 70% 58%)`;
}

// Draws a line (curvature 0) as a segment long enough to still look infinite
// at the current zoom: extended well past the viewport in both directions
// along its tangent (perpendicular to its stored normal).
function drawLine(ctx, camera, c) {
  const dirX = -c.ny;
  const dirY = c.nx;
  const reach = (Math.hypot(camera.width, camera.height) / camera.zoomScale) * 2;
  const [sx1, sy1] = camera.worldToScreen(c.x - dirX * reach, c.y - dirY * reach);
  const [sx2, sy2] = camera.worldToScreen(c.x + dirX * reach, c.y + dirY * reach);
  ctx.beginPath();
  ctx.moveTo(sx1, sy1);
  ctx.lineTo(sx2, sy2);
  ctx.strokeStyle = colorForCircle(c);
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawLabel(ctx, c, sx, sy, screenR) {
  const text = String(Math.round(c.k));
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

// Draws the currently-materialized circles that qualify for the CURRENT
// camera state. A circle materialized under a previous, more-zoomed-in
// camera state may no longer be large enough or in view now, so the same
// pixel-size/viewport filters used during expansion are re-applied here.
//
// options.renderMode: 'filled' | 'outline' (the enclosing/negative-curvature
// circle is always filled, since it acts as the canvas backdrop).
// options.showLabels: draw the rounded curvature inside circles large enough
// to fit it (integral-mode display).
export function draw(gasket, camera, frame, minPixelRadius, options = {}) {
  const { renderMode = 'filled', showLabels = false } = options;
  const ctx = camera.ctx;
  const dpr = camera.dpr;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, camera.width, camera.height);

  const viewport = camera.viewportWorldBounds(0);
  let drawnCount = 0;

  for (const c of gasket.materialized.values()) {
    if (c.k === 0) {
      // A line has no natural bbox; cull it by perpendicular distance from
      // the viewport center instead — if that exceeds the viewport's own
      // half-diagonal, the line can't be crossing the visible area.
      const dist = Math.abs(c.nx * (camera.centerX - c.x) + c.ny * (camera.centerY - c.y));
      const viewportHalfDiag = Math.hypot(viewport.maxX - viewport.minX, viewport.maxY - viewport.minY) / 2;
      if (dist > viewportHalfDiag) continue;
      c.lastSeenFrame = frame;
      drawnCount++;
      drawLine(ctx, camera, c);
      continue;
    }

    const r = Math.abs(1 / c.k);
    const screenR = r * camera.zoomScale;
    if (screenR < minPixelRadius) continue;
    if (c.x + r < viewport.minX || c.x - r > viewport.maxX || c.y + r < viewport.minY || c.y - r > viewport.maxY) {
      continue;
    }

    c.lastSeenFrame = frame;
    drawnCount++;

    const [sx, sy] = camera.worldToScreen(c.x, c.y);
    ctx.beginPath();
    ctx.arc(sx, sy, screenR, 0, Math.PI * 2);

    if (renderMode === 'outline' && c.k > 0) {
      ctx.strokeStyle = colorForCircle(c);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      ctx.fillStyle = colorForCircle(c);
      ctx.fill();
    }

    if (showLabels) drawLabel(ctx, c, sx, sy, screenR);
  }

  return drawnCount;
}

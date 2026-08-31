import Decimal from 'decimal.js';

// Precision budget for the whole deep-zoom recursion. 60 significant digits
// leaves ~45 digits of zoom headroom after the camera's own safety margin
// (see decimal-camera.js) — many, many orders of magnitude past float64's
// ~1e12-1e15 practical ceiling. Raising this trades generation speed for
// depth; every decimal-*.js module shares this one configured Decimal via
// module caching, so it only needs setting once, here, before anything else
// runs.
Decimal.set({ precision: 60 });

import { Camera } from './decimal-camera.js';
import { GasketTree } from './decimal-gasket.js';
import { buildSeedQuadruple } from './decimal-seed.js';
import { placeQuadruple, buildInitialFrontiers } from './decimal-quadruple.js';
import { draw } from './decimal-render.js';
import { initControlPanel } from './ui.js';

const MIN_PIXEL_RADIUS = 0.75;
const DEFAULT_MAX_DEPTH = 10;
const DEFAULT_MAX_COUNT = 600;
const INTEGER_TOLERANCE = 1e-6;

const canvas = document.getElementById('canvas');
const hud = document.getElementById('hud');
const camera = new Camera(canvas);

function circlesBBox(circles) {
  let minX = new Decimal(Infinity);
  let minY = new Decimal(Infinity);
  let maxX = new Decimal(-Infinity);
  let maxY = new Decimal(-Infinity);
  for (const c of circles) {
    if (c.k.isZero()) continue;
    const r = c.k.abs().pow(-1);
    minX = Decimal.min(minX, c.x.minus(r));
    maxX = Decimal.max(maxX, c.x.plus(r));
    minY = Decimal.min(minY, c.y.minus(r));
    maxY = Decimal.max(maxY, c.y.plus(r));
  }
  return { minX, minY, maxX, maxY };
}

const state = {
  gasket: null,
  renderMode: 'filled',
  showLabels: false,
  maxDepth: DEFAULT_MAX_DEPTH,
  maxCount: DEFAULT_MAX_COUNT,
  integralMode: false,
};

let frame = 0;
let pendingContinuation = true;

function regenerate({ curvatures, presetId }) {
  let circles;
  let nextId;

  if (presetId === 'default') {
    const seed = buildSeedQuadruple();
    circles = seed.circles;
    nextId = seed.nextId;
  } else {
    if (state.integralMode) {
      const nonInteger = curvatures.some((k) => Math.abs(k - Math.round(k)) > INTEGER_TOLERANCE);
      if (nonInteger) {
        return { valid: false, error: 'Integral mode requires whole-number curvatures.' };
      }
    }
    const result = placeQuadruple(...curvatures);
    if (!result.valid) return result;
    circles = result.circles;
    nextId = result.nextId;
  }

  const frontiers = buildInitialFrontiers(circles);
  state.gasket = new GasketTree({ circles, nextId }, frontiers, { MIN_PIXEL_RADIUS });
  state.gasket.eagerGenerate(state.maxDepth, state.maxCount, frame);
  state.initialBBox = circlesBBox(circles);
  camera.fitToBBox(state.initialBBox);
  pendingContinuation = true;

  return { valid: true };
}

initControlPanel(state, {
  onGenerate: regenerate,
  onDensityChange: ({ maxDepth, maxCount }) => {
    state.maxDepth = maxDepth;
    state.maxCount = maxCount;
    state.gasket.eagerGenerate(maxDepth, maxCount, frame);
    camera.dirty = true;
  },
  onRenderModeChange: (mode) => {
    state.renderMode = mode;
    camera.dirty = true;
  },
  onIntegralModeChange: (enabled) => {
    state.integralMode = enabled;
    state.showLabels = enabled;
    camera.dirty = true;
  },
  onResetView: () => {
    camera.fitToBBox(state.initialBBox);
    camera.dirty = true;
  },
});

regenerate({ curvatures: null, presetId: 'default' });

function tick() {
  frame++;
  const dirty = camera.consumeDirty();

  if (dirty || pendingContinuation) {
    const viewport = camera.viewportWorldBounds(0.25);
    const result = state.gasket.expand(viewport, camera.zoomScale, frame);
    pendingContinuation = result.hasMoreWork;

    const drawnCount = draw(state.gasket, camera, frame, MIN_PIXEL_RADIUS, {
      renderMode: state.renderMode,
      showLabels: state.showLabels,
    });
    hud.textContent = `circles: ${state.gasket.materialized.size} (drawn ${drawnCount}) | zoom: ${camera.zoomScale.toExponential(2)}x | precision: ${Decimal.precision}sd`;
  }

  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);

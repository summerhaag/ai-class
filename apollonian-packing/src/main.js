import { Camera } from './camera.js';
import { GasketTree } from './gasket.js';
import { buildSeedQuadruple } from './seed.js';
import { placeQuadruple, buildInitialFrontiers } from './quadruple.js';
import { draw } from './render.js';
import { initControlPanel } from './ui.js';

const VIEWPORT_MARGIN = 0.25;
const MIN_PIXEL_RADIUS = 0.75;
const DEFAULT_MAX_DEPTH = 13;
const DEFAULT_MAX_COUNT = 4000;
const INTEGER_TOLERANCE = 1e-6;

const canvas = document.getElementById('canvas');
const hud = document.getElementById('hud');
const camera = new Camera(canvas);

// Skips lines (k=0, infinite extent) — a valid quadruple always has at least
// two genuine circles to frame the view from.
function circlesBBox(circles) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of circles) {
    if (c.k === 0) continue;
    const r = Math.abs(1 / c.k);
    minX = Math.min(minX, c.x - r);
    maxX = Math.max(maxX, c.x + r);
    minY = Math.min(minY, c.y - r);
    maxY = Math.max(maxY, c.y + r);
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

// A brand-new quadruple (default preset or custom) gets a fresh GasketTree —
// appending into the old tree's shared queue/cache would silently mix two
// unrelated packings. Raising the density controls on the *current*
// quadruple is handled separately (onDensityChange below), reusing the same
// live tree.
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
    const viewport = camera.viewportWorldBounds(VIEWPORT_MARGIN);
    const result = state.gasket.expand(viewport, camera.zoomScale, frame);
    pendingContinuation = result.hasMoreWork;

    const drawnCount = draw(state.gasket, camera, frame, MIN_PIXEL_RADIUS, {
      renderMode: state.renderMode,
      showLabels: state.showLabels,
    });
    hud.textContent = `circles: ${state.gasket.materialized.size} (drawn ${drawnCount}) | zoom: ${camera.zoomScale.toExponential(2)}x`;
  }

  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);

import { evaluateExpression } from './expr.js';

const SYMMETRIC_K = 1 + (2 * Math.sqrt(3)) / 3;

export const PRESETS = [
  { id: 'default', label: 'Classic symmetric', integral: false, curvatures: [-1, SYMMETRIC_K, SYMMETRIC_K, SYMMETRIC_K] },
  { id: 'a', label: 'Integral: (-1, 2, 2, 3)', integral: true, curvatures: [-1, 2, 2, 3] },
  { id: 'b', label: 'Integral: (-3, 5, 8, 8)', integral: true, curvatures: [-3, 5, 8, 8] },
  {
    id: 'halfplane',
    label: 'Half-plane: (0, 1, 2, (1+√2)²)',
    integral: false,
    curvatures: [0, 1, 2, (1 + Math.sqrt(2)) ** 2],
    display: ['0', '1', '2', '(1+sqrt(2))^2'],
  },
  { id: 'strip', label: 'Strip: (0, 0, 1, 1)', integral: false, curvatures: [0, 0, 1, 1] },
];

// Wires up the control panel DOM: quadruple input + presets, density
// controls, render-mode toggle, integral-mode toggle. Owns all DOM
// lookups/listeners; calls back into main.js's orchestration functions.
// callbacks.onGenerate({curvatures, presetId}) must return
// {valid:true} or {valid:false, error} synchronously so errors can be shown
// inline.
export function initControlPanel(initialState, callbacks) {
  const el = (id) => document.getElementById(id);
  const kInputs = ['k1', 'k2', 'k3', 'k4'].map(el);
  const presetSelect = el('preset');
  const generateBtn = el('generate');
  const errorEl = el('quad-error');
  const depthSlider = el('max-depth');
  const depthValue = el('depth-value');
  const countInput = el('max-count');
  const integralCheckbox = el('integral-mode');
  const panel = el('panel');
  const panelToggle = el('panel-toggle');
  const resetViewBtn = el('reset-view');

  function renderPresetOptions() {
    const list = integralCheckbox.checked ? PRESETS.filter((p) => p.integral) : PRESETS;
    const prevValue = presetSelect.value;
    presetSelect.innerHTML = '';
    for (const p of list) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.label;
      presetSelect.appendChild(opt);
    }
    if (list.some((p) => p.id === prevValue)) presetSelect.value = prevValue;
  }

  function fillInputs(curvatures) {
    kInputs.forEach((input, i) => {
      input.value = curvatures[i];
    });
  }

  function fillInputsForPreset(preset) {
    fillInputs(preset.display || preset.curvatures);
  }

  function selectPreset(id) {
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) return;
    presetSelect.value = id;
    fillInputsForPreset(preset);
    const result = callbacks.onGenerate({ curvatures: preset.curvatures, presetId: preset.id });
    errorEl.textContent = result && result.error ? result.error : '';
  }

  renderPresetOptions();
  presetSelect.value = 'default';
  fillInputsForPreset(PRESETS[0]);

  depthSlider.value = initialState.maxDepth;
  depthValue.textContent = initialState.maxDepth;
  countInput.value = initialState.maxCount;

  presetSelect.addEventListener('change', () => selectPreset(presetSelect.value));

  generateBtn.addEventListener('click', () => {
    const values = [];
    for (const input of kInputs) {
      try {
        values.push(evaluateExpression(input.value));
      } catch (e) {
        errorEl.textContent = `Invalid curvature '${input.value}': ${e.message}`;
        return;
      }
    }
    const result = callbacks.onGenerate({ curvatures: values, presetId: null });
    errorEl.textContent = result && result.error ? result.error : '';
  });

  depthSlider.addEventListener('input', () => {
    depthValue.textContent = depthSlider.value;
    callbacks.onDensityChange({ maxDepth: Number(depthSlider.value), maxCount: Number(countInput.value) });
  });

  countInput.addEventListener('change', () => {
    callbacks.onDensityChange({ maxDepth: Number(depthSlider.value), maxCount: Number(countInput.value) });
  });

  document.querySelectorAll('input[name="render-mode"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      if (radio.checked) callbacks.onRenderModeChange(radio.value);
    });
  });

  integralCheckbox.addEventListener('change', () => {
    renderPresetOptions();
    callbacks.onIntegralModeChange(integralCheckbox.checked);
    if (integralCheckbox.checked) {
      selectPreset(PRESETS.find((p) => p.integral).id);
    }
  });

  panelToggle.addEventListener('click', () => {
    const isHidden = panel.classList.toggle('hidden');
    panelToggle.setAttribute('aria-expanded', String(!isHidden));
  });

  resetViewBtn.addEventListener('click', () => {
    callbacks.onResetView();
  });
}

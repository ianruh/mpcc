import appState from './state.js';
import { createPlots, createControls } from './components.js';

// ─────────────────────────────────────────────────────────────────────────────
// createApp
//   Wires state, controls, and plots together. Returns { init() }.
// ─────────────────────────────────────────────────────────────────────────────
function createApp(state, { controlsEl, tsEl, mpEl, tsDescEl, mpDescEl }) {
  const plots    = createPlots(tsEl, mpEl);
  const controls = createControls(controlsEl, {

    onFileLoad(series) {
      state.series = series;
      state.mp     = null;
      tsDescEl.textContent = `${series.length.toLocaleString()} points`;
      mpDescEl.textContent = '—';
      plots.updateSeries(series, null, state.m);
    },

    onCompute() {
      const { wasm, series, m } = state;
      const result = wasm.matrixProfileNaive(series, m);
      state.mp = result;

      const profileLen = result.distances.length;
      const finite     = Array.from(result.distances).filter(isFinite);
      const minDist    = finite.length > 0 ? Math.min(...finite) : NaN;

      plots.updateSeries(series, result, m);
      plots.updateMatrixProfile(result, m);

      tsDescEl.textContent = `${series.length.toLocaleString()} points · m=${m}`;
      mpDescEl.textContent = isFinite(minDist)
        ? `${profileLen.toLocaleString()} values · min distance ${minDist.toFixed(4)}`
        : `${profileLen.toLocaleString()} values`;

      controls.setStatus(
        `Done — m=${m}, ${profileLen.toLocaleString()} profile values`,
        'success'
      );
    },
  });

  async function init() {
    controls.setStatus('Loading WASM module…', 'busy');
    try {
      const { default: initMPCC } = await import('./mpcc_wasm_base.js');
      state.wasm = await initMPCC();
      controls.setStatus('Ready — upload a file to begin', 'success');
      if (state.series) controls.enableCompute(true);
    } catch (err) {
      controls.setStatus(
        'WASM not found — run the Bazel build first (see README)',
        'error'
      );
      console.error('WASM load error:', err);
    }
  }

  return { init };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────
const app = createApp(appState, {
  controlsEl: document.getElementById('controls-bar'),
  tsEl:       document.getElementById('ts-plot'),
  mpEl:       document.getElementById('mp-plot'),
  tsDescEl:   document.getElementById('ts-desc'),
  mpDescEl:   document.getElementById('mp-desc'),
});

app.init();

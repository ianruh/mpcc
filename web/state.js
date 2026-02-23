// Global application state — one object shared across all modules.
const appState = {
  wasm:   null,   // Loaded Emscripten WASM module instance
  series: null,   // number[] — the parsed time series
  mp:     null,   // { distances: Float64Array, indices: Int32Array }
  m:      20,     // Subsequence length
};

export default appState;

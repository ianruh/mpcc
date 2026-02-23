// WASM module loading and Matrix Profile computation.

let instance = null;

export async function loadWasm() {
  if (instance) return instance;
  const { default: initMPCC } = await import('../mpcc_wasm_base.js');
  instance = await initMPCC();
  return instance;
}

// Returns { distances: Float64Array, indices: Int32Array }
export function computeMatrixProfile(wasm, series, m) {
  return wasm.matrixProfileNaive(series, m);
}

// Returns Float64Array of distances from the query subsequence to every position in series.
// queryIdx is clamped so the query never overruns the end of the series.
export function computeSimilaritySearch(wasm, series, queryIdx, m) {
  const clampedIdx = Math.max(0, Math.min(queryIdx, series.length - m));
  const query = series.slice(clampedIdx, clampedIdx + m);
  return { distances: wasm.similaritySearch(series, query), queryIdx: clampedIdx };
}

// Returns the index of the minimum finite value in a distance array, or -1 if none.
export function findMotifIndex(distances) {
  let motifIdx = -1, minDist = Infinity;
  for (let i = 0; i < distances.length; i++) {
    const d = distances[i];
    if (isFinite(d) && d < minDist) { minDist = d; motifIdx = i; }
  }
  return motifIdx;
}

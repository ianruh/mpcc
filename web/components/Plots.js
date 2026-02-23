import { html }              from 'htm/preact';
import { useRef, useEffect } from 'preact/hooks';
import { findMotifIndex }    from '../lib/wasm.js';

// ── Shared Plotly config ──────────────────────────────────────────────────────

const PLOT_CONFIG = { responsive: true, displayModeBar: false, displaylogo: false };

const BASE_LAYOUT = {
  paper_bgcolor: 'transparent',
  plot_bgcolor:  'transparent',
  margin: { t: 12, b: 44, l: 56, r: 16 },
  font:   { family: 'system-ui, sans-serif', size: 11, color: '#8b949e' },
  xaxis: {
    gridcolor: '#21262d', zerolinecolor: '#30363d',
    tickfont:  { size: 11 }, title: { text: 'Index', font: { size: 11 } },
  },
  yaxis: {
    gridcolor: '#21262d', zerolinecolor: '#30363d',
    tickfont:  { size: 11 },
  },
  showlegend: false,
};

const placeholder = text => ({
  ...BASE_LAYOUT,
  annotations: [{
    text, xref: 'paper', yref: 'paper', x: 0.5, y: 0.5,
    showarrow: false, font: { size: 14, color: '#30363d' },
  }],
});

// ── Plot data builders (pure functions) ───────────────────────────────────────

function buildTimeSeriesData(series, matrixProfile, m) {
  if (!series) {
    return { traces: [], layout: placeholder('Upload a file to begin') };
  }

  const x      = Array.from({ length: series.length }, (_, i) => i);
  const shapes = [], annotations = [];

  if (matrixProfile) {
    const motifIdx = findMotifIndex(matrixProfile.distances);
    if (motifIdx >= 0) {
      const nnIdx = matrixProfile.indices[motifIdx];
      const rect  = (x0, color) => ({
        type: 'rect', xref: 'x', yref: 'paper',
        x0, x1: x0 + m - 1, y0: 0, y1: 1,
        fillcolor: color, opacity: 0.18,
        line: { width: 1.5, color }, layer: 'below',
      });
      shapes.push(rect(motifIdx, '#a78bfa'));
      annotations.push({
        x: motifIdx + m / 2, y: 1.06, xref: 'x', yref: 'paper',
        text: 'Motif', showarrow: false, font: { size: 10, color: '#a78bfa' },
      });
      if (nnIdx >= 0 && nnIdx !== motifIdx) {
        shapes.push(rect(nnIdx, '#38bdf8'));
        annotations.push({
          x: nnIdx + m / 2, y: 1.06, xref: 'x', yref: 'paper',
          text: 'Neighbor', showarrow: false, font: { size: 10, color: '#38bdf8' },
        });
      }
    }
  }

  return {
    traces: [{ x, y: series, type: 'scatter', mode: 'lines',
      line: { color: '#7c6af7', width: 1.2 }, name: 'Series' }],
    layout: {
      ...BASE_LAYOUT,
      yaxis: { ...BASE_LAYOUT.yaxis, title: { text: 'Value', font: { size: 11 } } },
      shapes, annotations,
    },
  };
}

function buildMatrixProfileData(matrixProfile) {
  if (!matrixProfile) {
    return { traces: [], layout: placeholder('Compute the matrix profile to see results') };
  }

  const { distances } = matrixProfile;
  const n         = distances.length;
  const x         = Array.from({ length: n }, (_, i) => i);
  const y         = Array.from(distances).map(v => isFinite(v) ? v : null);
  const motifIdx  = findMotifIndex(distances);

  const traces = [{
    x, y, type: 'scatter', mode: 'lines', connectgaps: false,
    line: { color: '#38bdf8', width: 1.2 }, name: 'Matrix Profile',
  }];
  if (motifIdx >= 0) {
    traces.push({
      x: [motifIdx], y: [y[motifIdx]], type: 'scatter', mode: 'markers',
      marker: { symbol: 'star', size: 10, color: '#fb923c' },
      name: `Motif @ ${motifIdx} (d=${y[motifIdx].toFixed(3)})`,
    });
  }

  return {
    traces,
    layout: {
      ...BASE_LAYOUT,
      showlegend: motifIdx >= 0,
      yaxis: { ...BASE_LAYOUT.yaxis, title: { text: 'Distance', font: { size: 11 } }, rangemode: 'tozero' },
    },
  };
}

function buildSimilaritySearchData(result, m) {
  if (!result) {
    return { traces: [], layout: placeholder('Click a point on either plot above to run a similarity search') };
  }

  const { distances, queryIdx } = result;
  const n          = distances.length;
  const x          = Array.from({ length: n }, (_, i) => i);
  const y          = Array.from(distances).map(v => isFinite(v) ? v : null);
  const exclZone   = Math.floor(m / 4);

  let bestIdx = -1, minDist = Infinity;
  for (let i = 0; i < n; i++) {
    if (Math.abs(i - queryIdx) <= exclZone) continue;
    if (y[i] !== null && y[i] < minDist) { minDist = y[i]; bestIdx = i; }
  }

  const traces = [{
    x, y, type: 'scatter', mode: 'lines', connectgaps: false,
    line: { color: '#4ade80', width: 1.2 }, name: 'Distance Profile',
  }];
  if (bestIdx >= 0) {
    traces.push({
      x: [bestIdx], y: [y[bestIdx]], type: 'scatter', mode: 'markers',
      marker: { symbol: 'star', size: 10, color: '#fb923c' },
      name: `Best match @ ${bestIdx} (d=${y[bestIdx].toFixed(3)})`,
    });
  }

  return {
    traces,
    layout: {
      ...BASE_LAYOUT,
      showlegend: bestIdx >= 0,
      yaxis: { ...BASE_LAYOUT.yaxis, title: { text: 'Distance', font: { size: 11 } }, rangemode: 'tozero' },
      shapes: [{
        type: 'line', xref: 'x', yref: 'paper',
        x0: queryIdx, x1: queryIdx, y0: 0, y1: 1,
        line: { color: '#a78bfa', width: 1.5, dash: 'dot' },
      }],
      annotations: [{
        x: queryIdx, y: 1.06, xref: 'x', yref: 'paper',
        text: `Query @ ${queryIdx}`, showarrow: false, font: { size: 10, color: '#a78bfa' },
      }],
    },
  };
}

// ── Description helpers ───────────────────────────────────────────────────────

function tsDesc(series, matrixProfile, m) {
  if (!series) return '—';
  const pts = series.length.toLocaleString();
  return matrixProfile ? `${pts} points · m=${m}` : `${pts} points`;
}

function mpDesc(matrixProfile) {
  if (!matrixProfile) return '—';
  const len      = matrixProfile.distances.length.toLocaleString();
  const motifIdx = findMotifIndex(matrixProfile.distances);
  if (motifIdx < 0) return `${len} values`;
  return `${len} values · min distance ${matrixProfile.distances[motifIdx].toFixed(4)}`;
}

function ssDesc(result, m) {
  if (!result) return '—';
  return `query @ ${result.queryIdx}, m=${m}`;
}

// ── PlotContainer ─────────────────────────────────────────────────────────────

// Manages a single Plotly chart. Initializes on mount, updates on every render.
// onPointClick(idx) is called when the user clicks a data point (optional).
function PlotContainer({ traces, layout, onPointClick }) {
  const elRef      = useRef(null);
  const handlerRef = useRef(onPointClick);
  handlerRef.current = onPointClick; // keep ref current across renders

  // Initialize Plotly and attach the click handler on mount.
  useEffect(() => {
    const el = elRef.current;
    Plotly.newPlot(el, [], BASE_LAYOUT, PLOT_CONFIG);
    el.on('plotly_click', data => {
      const pt = data.points?.[0];
      if (pt && handlerRef.current) handlerRef.current(Math.round(pt.x));
    });
    return () => Plotly.purge(el);
  }, []);

  // Sync chart data after every render.
  useEffect(() => {
    if (elRef.current) Plotly.react(elRef.current, traces, layout, PLOT_CONFIG);
  });

  return html`<div class="plot-el" ref=${elRef}></div>`;
}

// ── PlotCard ──────────────────────────────────────────────────────────────────

function PlotCard({ title, desc, children }) {
  return html`
    <div class="plot-card">
      <div class="plot-card-header">
        <span class="plot-title">${title}</span>
        <span class="plot-desc">${desc}</span>
      </div>
      ${children}
    </div>
  `;
}

// ── Public component ──────────────────────────────────────────────────────────

// Renders the three plot cards (Time Series, Matrix Profile, Similarity Search).
// onPointClick(idx) is forwarded to the TS and MP plots to trigger similarity search.
export function PlotsArea({ series, matrixProfile, similaritySearch, m, onPointClick }) {
  const tsData = buildTimeSeriesData(series, matrixProfile, m);
  const mpData = buildMatrixProfileData(matrixProfile);
  const ssData = buildSimilaritySearchData(similaritySearch, m);

  return html`
    <div class="plots-area">
      <${PlotCard} title="Time Series" desc=${tsDesc(series, matrixProfile, m)}>
        <${PlotContainer} traces=${tsData.traces} layout=${tsData.layout} onPointClick=${onPointClick} />
      <//>
      <${PlotCard} title="Matrix Profile" desc=${mpDesc(matrixProfile)}>
        <${PlotContainer} traces=${mpData.traces} layout=${mpData.layout} onPointClick=${onPointClick} />
      <//>
      <${PlotCard} title="Similarity Search" desc=${ssDesc(similaritySearch, m)}>
        <${PlotContainer} traces=${ssData.traces} layout=${ssData.layout} />
      <//>
    </div>
  `;
}

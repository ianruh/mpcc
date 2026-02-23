import appState from './state.js';

// ─────────────────────────────────────────────────────────────────────────────
// createFileParser
//   Returns { parseFile(file) → Promise<{ name: string, values: number[] }[]> }
//   Always returns an array of named series — callers handle single vs. multi.
// ─────────────────────────────────────────────────────────────────────────────
export function createFileParser() {

  // Returns all fully-numeric columns as { name, values }[].
  // A column is included if every non-empty cell in it parses as a finite number.
  function parseCsv(text) {
    const lines = text.trim().split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length === 0) throw new Error('File is empty');

    const first = lines[0];
    const delim = [',', ';', '\t'].reduce(
      (best, d) => (first.split(d).length > first.split(best).length ? d : best), ','
    );

    const firstCells = lines[0].split(delim).map(c => c.trim().replace(/^"|"$/g, ''));
    const hasHeader  = firstCells.some(c => c !== '' && isNaN(Number(c)));
    const headers    = hasHeader ? firstCells : firstCells.map((_, i) => `Column ${i + 1}`);
    const dataLines  = lines.slice(hasHeader ? 1 : 0);

    if (dataLines.length === 0) throw new Error('No data rows found');

    const series = headers.map((name, j) => {
      const values = [];
      for (const line of dataLines) {
        const raw = (line.split(delim)[j] ?? '').trim().replace(/^"|"$/g, '');
        if (raw === '') continue;         // treat empty cells as missing
        const v = Number(raw);
        if (isNaN(v)) return null;        // non-numeric cell → discard whole column
        values.push(v);
      }
      return values.length > 0 ? { name, values } : null;
    }).filter(Boolean);

    if (series.length === 0) throw new Error('No numeric columns found in file');
    return series;
  }

  // Returns all numeric fields / arrays as { name, values }[].
  function parseJson(text) {
    let data;
    try { data = JSON.parse(text); }
    catch (e) { throw new Error(`Invalid JSON: ${e.message}`); }

    // Plain number array: [1.0, 2.0, …]
    if (Array.isArray(data)) {
      if (data.length === 0) throw new Error('JSON array is empty');

      if (typeof data[0] === 'number') {
        return [{ name: 'Series', values: data }];
      }

      // Array of objects: [{ "temp": 1.0, "pressure": 1013 }, …]
      if (typeof data[0] === 'object' && data[0] !== null) {
        const numericKeys = Object.keys(data[0]).filter(k =>
          data.every(obj => {
            const raw = obj[k];
            return raw !== null && raw !== undefined
              && String(raw).trim() !== '' && !isNaN(Number(raw));
          })
        );
        if (numericKeys.length === 0) throw new Error(
          'No fully-numeric fields found in JSON objects'
        );
        return numericKeys.map(key => ({
          name:   key,
          values: data.map(obj => Number(obj[key])),
        }));
      }
    }

    // Object with numeric array fields: { "temperature": [1.0, …], "pressure": [1013, …] }
    if (typeof data === 'object' && data !== null) {
      const series = Object.entries(data)
        .filter(([, v]) => Array.isArray(v) && v.length > 0 && v.every(x => typeof x === 'number'))
        .map(([name, values]) => ({ name, values }));
      if (series.length > 0) return series;
    }

    throw new Error(
      'Unsupported JSON format. Expected an array of numbers, an array of objects with numeric fields, '
      + 'or an object whose values are numeric arrays.'
    );
  }

  return {
    async parseFile(file) {
      const text = await file.text();
      const ext  = file.name.split('.').pop().toLowerCase();
      if (ext === 'json') return parseJson(text);
      if (['csv', 'tsv', 'txt'].includes(ext)) return parseCsv(text);
      const trimmed = text.trim();
      return (trimmed.startsWith('[') || trimmed.startsWith('{'))
        ? parseJson(text)
        : parseCsv(text);
    },
  };
}

  // Shared Plotly layout fragments
  const BASE_LAYOUT = {
    paper_bgcolor: 'transparent',
    plot_bgcolor:  'transparent',
    margin: { t: 12, b: 44, l: 56, r: 16 },
    font:   { family: 'system-ui, sans-serif', size: 11, color: '#8b949e' },
    xaxis: {
      gridcolor:     '#21262d',
      zerolinecolor: '#30363d',
      tickfont:      { size: 11 },
    },
    yaxis: {
      gridcolor:     '#21262d',
      zerolinecolor: '#30363d',
      tickfont:      { size: 11 },
    },
    legend: {
      bgcolor:  'transparent',
      font:     { size: 11, color: '#8b949e' },
      x: 1, xanchor: 'right', y: 1,
    },
    showlegend: false,
  };
  const PLOT_CONFIG = { responsive: true, displayModeBar: false, displaylogo: false };

// ─────────────────────────────────────────────────────────────────────────────
// createPlots
//   Returns { updateSeries(series, mpResult, m), updateMatrixProfile(mpResult, m) }
//   Manages the two Plotly charts (time series and matrix profile).
// ─────────────────────────────────────────────────────────────────────────────
export function createPlots(tsEl, mpEl, ssEl, { onPointClick } = {}) {


  // Initialise empty plots
  Plotly.newPlot(tsEl, [], {
    ...BASE_LAYOUT,
    annotations: [{
      text: 'Upload a file to begin',
      xref: 'paper', yref: 'paper', x: 0.5, y: 0.5,
      showarrow: false, font: { size: 14, color: '#30363d' },
    }],
  }, PLOT_CONFIG);

  Plotly.newPlot(mpEl, [], {
    ...BASE_LAYOUT,
    annotations: [{
      text: 'Compute the matrix profile to see results',
      xref: 'paper', yref: 'paper', x: 0.5, y: 0.5,
      showarrow: false, font: { size: 14, color: '#30363d' },
    }],
  }, PLOT_CONFIG);

  Plotly.newPlot(ssEl, [], {
    ...BASE_LAYOUT,
    annotations: [{
      text: 'Click a point on either plot above to run a similarity search',
      xref: 'paper', yref: 'paper', x: 0.5, y: 0.5,
      showarrow: false, font: { size: 14, color: '#30363d' },
    }],
  }, PLOT_CONFIG);

  // Register click handlers on both plots — Plotly attaches .on() to the div
  // after newPlot, so these registrations are safe here.
  if (onPointClick) {
    const handler = data => {
      if (data.points?.[0]) onPointClick(Math.round(data.points[0].x));
    };
    tsEl.on('plotly_click', handler);
    mpEl.on('plotly_click', handler);
  }

  // Build vrect shapes for motif / nearest-neighbour on the time series plot
  function buildMotifShapes(mpResult, m) {
    if (!mpResult) return [];

    const { distances, indices } = mpResult;
    let motifIdx = -1;
    let minDist  = Infinity;
    for (let i = 0; i < distances.length; i++) {
      const d = distances[i];
      if (isFinite(d) && d < minDist) { minDist = d; motifIdx = i; }
    }
    if (motifIdx === -1) return [];

    const nnIdx = indices[motifIdx];

    const rect = (x0, color) => ({
      type:      'rect',
      xref:      'x',
      yref:      'paper',
      x0,
      x1:        x0 + m - 1,
      y0:        0,
      y1:        1,
      fillcolor: color,
      opacity:   0.18,
      line:      { width: 1.5, color },
      layer:     'below',
    });

    const shapes = [rect(motifIdx, '#a78bfa')];
    if (nnIdx >= 0 && nnIdx !== motifIdx) shapes.push(rect(nnIdx, '#38bdf8'));
    return shapes;
  }

  function updateSeries(series, mpResult, m) {
    const x      = Array.from({ length: series.length }, (_, i) => i);
    const shapes = buildMotifShapes(mpResult, m);

    const annotations = [];
    if (shapes.length > 0) {
      annotations.push({
        x: shapes[0].x0 + m / 2, y: 1.06,
        xref: 'x', yref: 'paper',
        text: 'Motif', showarrow: false,
        font: { size: 10, color: '#a78bfa' },
      });
    }
    if (shapes.length > 1) {
      annotations.push({
        x: shapes[1].x0 + m / 2, y: 1.06,
        xref: 'x', yref: 'paper',
        text: 'Neighbor', showarrow: false,
        font: { size: 10, color: '#38bdf8' },
      });
    }

    Plotly.react(tsEl, [{
      x, y: series,
      type: 'scatter', mode: 'lines',
      line: { color: '#7c6af7', width: 1.2 },
      name: 'Series',
    }], {
      ...BASE_LAYOUT,
      xaxis: { ...BASE_LAYOUT.xaxis, title: { text: 'Index', font: { size: 11 } } },
      yaxis: { ...BASE_LAYOUT.yaxis, title: { text: 'Value', font: { size: 11 } } },
      shapes,
      annotations,
    }, PLOT_CONFIG);
  }

  function updateMatrixProfile(mpResult, m) {
    const { distances, indices } = mpResult;
    const n = distances.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = Array.from(distances).map(v => isFinite(v) ? v : null);

    // Locate motif (minimum finite distance)
    let motifIdx = -1;
    let minDist  = Infinity;
    for (let i = 0; i < n; i++) {
      if (y[i] !== null && y[i] < minDist) { minDist = y[i]; motifIdx = i; }
    }

    const traces = [{
      x, y,
      type: 'scatter', mode: 'lines',
      connectgaps: false,
      line: { color: '#38bdf8', width: 1.2 },
      name: 'Matrix Profile',
    }];

    if (motifIdx >= 0) {
      traces.push({
        x: [motifIdx], y: [y[motifIdx]],
        type: 'scatter', mode: 'markers',
        marker: { symbol: 'star', size: 10, color: '#fb923c' },
        name: `Motif @ ${motifIdx} (d=${y[motifIdx].toFixed(3)})`,
      });
    }

    Plotly.react(mpEl, traces, {
      ...BASE_LAYOUT,
      showlegend: motifIdx >= 0,
      xaxis: { ...BASE_LAYOUT.xaxis, title: { text: 'Index', font: { size: 11 } } },
      yaxis: { ...BASE_LAYOUT.yaxis, title: { text: 'Distance', font: { size: 11 } }, rangemode: 'tozero' },
    }, PLOT_CONFIG);
  }

  // distances: Float64Array from wasm.similaritySearch
  // queryIdx:  starting index of the query subsequence in the original series
  // m:         subsequence length
  function updateSimilaritySearch(distances, queryIdx, m) {
    const n = distances.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = Array.from(distances).map(v => isFinite(v) ? v : null);

    // Find the best match outside the exclusion zone around the query
    const exclZone = Math.floor(m / 4);
    let bestIdx = -1;
    let minDist  = Infinity;
    for (let i = 0; i < n; i++) {
      if (Math.abs(i - queryIdx) <= exclZone) continue;
      if (y[i] !== null && y[i] < minDist) { minDist = y[i]; bestIdx = i; }
    }

    const traces = [{
      x, y,
      type: 'scatter', mode: 'lines',
      connectgaps: false,
      line: { color: '#4ade80', width: 1.2 },
      name: 'Distance Profile',
    }];

    if (bestIdx >= 0) {
      traces.push({
        x: [bestIdx], y: [y[bestIdx]],
        type: 'scatter', mode: 'markers',
        marker: { symbol: 'star', size: 10, color: '#fb923c' },
        name: `Best match @ ${bestIdx} (d=${y[bestIdx].toFixed(3)})`,
      });
    }

    Plotly.react(ssEl, traces, {
      ...BASE_LAYOUT,
      showlegend: bestIdx >= 0,
      xaxis: { ...BASE_LAYOUT.xaxis, title: { text: 'Index', font: { size: 11 } } },
      yaxis: { ...BASE_LAYOUT.yaxis, title: { text: 'Distance', font: { size: 11 } }, rangemode: 'tozero' },
      shapes: [{
        type: 'line',
        xref: 'x', yref: 'paper',
        x0: queryIdx, x1: queryIdx,
        y0: 0, y1: 1,
        line: { color: '#a78bfa', width: 1.5, dash: 'dot' },
      }],
      annotations: [{
        x: queryIdx, y: 1.06,
        xref: 'x', yref: 'paper',
        text: `Query @ ${queryIdx}`,
        showarrow: false,
        font: { size: 10, color: '#a78bfa' },
      }],
    }, PLOT_CONFIG);
  }

  return { updateSeries, updateMatrixProfile, updateSimilaritySearch };
}

// ─────────────────────────────────────────────────────────────────────────────
// createControls
//   Builds the controls bar DOM, returns { setStatus(msg, type), enableCompute(bool) }.
//   Calls handlers.onFileLoad(values) and handlers.onCompute() in response to user input.
//   When a file contains multiple series, a dropdown is shown for selection.
// ─────────────────────────────────────────────────────────────────────────────
export function createControls(containerEl, { onFileLoad, onCompute }) {
  const parser = createFileParser();

  // Local state for the currently loaded series list
  let loadedSeries   = [];
  let currentFileName = '';

  // ── File upload ────────────────────────────────────────────────────────────
  const fileInput = document.createElement('input');
  fileInput.type   = 'file';
  fileInput.accept = '.csv,.json,.tsv,.txt';
  fileInput.style.display = 'none';

  const dropzone = document.createElement('label');
  dropzone.className = 'dropzone';
  dropzone.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
    Upload CSV / JSON
  `;
  dropzone.appendChild(fileInput);

  const fileNameEl = document.createElement('span');
  fileNameEl.className   = 'file-name';
  fileNameEl.textContent = 'No file loaded';

  const fileField = document.createElement('div');
  fileField.className = 'field';
  const fileLabel = document.createElement('label');
  fileLabel.textContent = 'Data File';
  fileField.append(fileLabel, dropzone, fileNameEl);

  // ── Series selector (hidden until a multi-series file is loaded) ───────────
  const seriesSelect = document.createElement('select');

  const seriesField = document.createElement('div');
  seriesField.className    = 'field';
  seriesField.style.display = 'none';
  const seriesLabel = document.createElement('label');
  seriesLabel.textContent = 'Series';
  seriesField.append(seriesLabel, seriesSelect);

  // ── Subsequence length ─────────────────────────────────────────────────────
  const mInput = document.createElement('input');
  mInput.type  = 'number';
  mInput.min   = '4';
  mInput.max   = '100000';
  mInput.value = String(appState.m);

  const mField = document.createElement('div');
  mField.className = 'field';
  const mLabel = document.createElement('label');
  mLabel.textContent = 'Subsequence Length (m)';
  mField.append(mLabel, mInput);

  // ── Compute button ─────────────────────────────────────────────────────────
  const computeBtn = document.createElement('button');
  computeBtn.className   = 'btn';
  computeBtn.textContent = 'Compute Matrix Profile';
  computeBtn.disabled    = true;

  // ── Status badge ───────────────────────────────────────────────────────────
  const statusEl = document.createElement('span');
  statusEl.className   = 'status-badge';
  statusEl.textContent = 'Loading WASM…';

  containerEl.append(fileField, seriesField, mField, computeBtn, statusEl);

  // ── Helpers ────────────────────────────────────────────────────────────────
  function setStatus(msg, type = '') {
    statusEl.className   = `status-badge${type ? ' ' + type : ''}`;
    statusEl.textContent = msg;
  }

  function selectSeries(s) {
    fileNameEl.textContent = loadedSeries.length > 1
      ? `${currentFileName} · ${s.name} · ${s.values.length.toLocaleString()} pts`
      : `${currentFileName} · ${s.values.length.toLocaleString()} pts`;
    onFileLoad(s.values);
    computeBtn.disabled = !appState.wasm;
  }

  // ── Drag-and-drop ──────────────────────────────────────────────────────────
  ['dragenter', 'dragover'].forEach(evt =>
    dropzone.addEventListener(evt, e => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    })
  );
  ['dragleave', 'drop'].forEach(evt =>
    dropzone.addEventListener(evt, e => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
    })
  );
  dropzone.addEventListener('drop', e => {
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  });

  fileInput.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    fileInput.value = ''; // reset so the same file can be re-selected
  });

  async function handleFile(file) {
    setStatus('Parsing…', 'busy');
    try {
      const allSeries = await parser.parseFile(file);
      loadedSeries    = allSeries;
      currentFileName = file.name;

      // Rebuild the series dropdown
      seriesSelect.innerHTML = '';
      allSeries.forEach(({ name, values }) => {
        const opt = document.createElement('option');
        opt.textContent = `${name} (${values.length.toLocaleString()} pts)`;
        seriesSelect.appendChild(opt);
      });

      seriesField.style.display = allSeries.length > 1 ? '' : 'none';

      if (allSeries.length > 1) {
        setStatus(`Loaded ${allSeries.length} series — select one to analyze`, 'success');
      } else {
        setStatus(`Loaded ${allSeries[0].values.length.toLocaleString()} data points`, 'success');
      }

      selectSeries(allSeries[0]);
    } catch (err) {
      setStatus(err.message, 'error');
    }
  }

  // ── Series dropdown change ─────────────────────────────────────────────────
  seriesSelect.addEventListener('change', () => {
    const s = loadedSeries[seriesSelect.selectedIndex];
    if (s) selectSeries(s);
  });

  // ── m input ────────────────────────────────────────────────────────────────
  mInput.addEventListener('input', () => {
    const v = parseInt(mInput.value, 10);
    if (!isNaN(v) && v >= 4) appState.m = v;
  });

  // ── Compute ────────────────────────────────────────────────────────────────
  computeBtn.addEventListener('click', () => {
    const m = parseInt(mInput.value, 10);

    if (isNaN(m) || m < 4) {
      setStatus('m must be ≥ 4', 'error');
      return;
    }
    if (!appState.series || appState.series.length < m * 2) {
      setStatus(`Series too short for m=${m} (need ≥ ${m * 2} points)`, 'error');
      return;
    }
    if (appState.series.length > 5000) {
      setStatus(
        `Large series (${appState.series.length.toLocaleString()} pts) — computation may take a moment…`,
        'busy'
      );
    } else {
      setStatus('Computing…', 'busy');
    }

    appState.m = m;
    computeBtn.innerHTML = '<span class="spinner"></span> Computing…';
    computeBtn.disabled  = true;

    // Yield to the browser so the spinner renders before WASM blocks the thread
    setTimeout(() => {
      try {
        onCompute();
      } catch (err) {
        setStatus(err.message, 'error');
      } finally {
        computeBtn.innerHTML = 'Compute Matrix Profile';
        computeBtn.disabled  = false;
      }
    }, 20);
  });

  return {
    setStatus,
    enableCompute(enabled) { computeBtn.disabled = !enabled; },
  };
}

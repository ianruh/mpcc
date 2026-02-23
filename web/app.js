import { html }                   from 'htm/preact';
import { render }                  from 'preact';
import { useState, useEffect }     from 'preact/hooks';
import { parseFile }               from './lib/parser.js';
import {
  loadWasm,
  computeMatrixProfile,
  computeSimilaritySearch,
  findMotifIndex,
} from './lib/wasm.js';
import { Controls }  from './components/Controls.js';
import { PlotsArea } from './components/Plots.js';

function App() {
  const [wasm, setWasm]                         = useState(null);
  const [allSeries, setAllSeries]               = useState([]);
  const [filename, setFilename]                 = useState(null);
  const [seriesIdx, setSeriesIdx]               = useState(0);
  const [m, setM]                               = useState(20);
  const [matrixProfile, setMatrixProfile]       = useState(null);
  const [similaritySearch, setSimilaritySearch] = useState(null);
  const [computing, setComputing]               = useState(false);
  const [status, setStatus]                     = useState({ type: 'busy', message: 'Loading WASM…' });

  const series = allSeries[seriesIdx]?.values ?? null;

  // Load WASM once on mount.
  useEffect(() => {
    loadWasm()
      .then(instance => {
        setWasm(instance);
        setStatus({ type: 'success', message: 'Ready — upload a file to begin' });
      })
      .catch(err => {
        console.error('WASM load error:', err);
        setStatus({ type: 'error', message: 'WASM not found — run the Bazel build first (see README)' });
      });
  }, []);

  async function handleFile(file) {
    setStatus({ type: 'busy', message: 'Parsing…' });
    try {
      const parsed = await parseFile(file);
      setAllSeries(parsed);
      setSeriesIdx(0);
      setFilename(file.name);
      setMatrixProfile(null);
      setSimilaritySearch(null);
      const msg = parsed.length > 1
        ? `Loaded ${parsed.length} series — select one to analyze`
        : `Loaded ${parsed[0].values.length.toLocaleString()} data points`;
      setStatus({ type: 'success', message: msg });
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    }
  }

  function handleSeriesChange(idx) {
    setSeriesIdx(idx);
    setMatrixProfile(null);
    setSimilaritySearch(null);
  }

  function handleCompute() {
    if (isNaN(m) || m < 4) {
      setStatus({ type: 'error', message: 'm must be ≥ 4' });
      return;
    }
    if (!series || series.length < m * 2) {
      setStatus({ type: 'error', message: `Series too short for m=${m} (need ≥ ${m * 2} points)` });
      return;
    }

    const msg = series.length > 5000
      ? `Large series (${series.length.toLocaleString()} pts) — computation may take a moment…`
      : 'Computing…';
    setStatus({ type: 'busy', message: msg });
    setComputing(true);

    // Yield to the browser so the spinner renders before WASM blocks the thread.
    setTimeout(() => {
      try {
        const result    = computeMatrixProfile(wasm, series, m);
        const motifIdx  = findMotifIndex(result.distances);
        const profileLen = result.distances.length.toLocaleString();
        const doneMsg   = motifIdx >= 0
          ? `Done — m=${m}, ${profileLen} values · min distance ${result.distances[motifIdx].toFixed(4)}`
          : `Done — m=${m}, ${profileLen} values`;

        setMatrixProfile(result);
        setSimilaritySearch(null);
        setStatus({ type: 'success', message: doneMsg });
      } catch (err) {
        setStatus({ type: 'error', message: err.message });
      } finally {
        setComputing(false);
      }
    }, 20);
  }

  function handlePointClick(idx) {
    if (!wasm || !series) return;
    try {
      const result = computeSimilaritySearch(wasm, series, idx, m);
      setSimilaritySearch(result);
    } catch (err) {
      console.error('Similarity search failed:', err);
    }
  }

  const canCompute = !!wasm && !!series && !computing;

  return html`
    <header>
      <h1>MPCC — <em>Matrix Profile Explorer</em></h1>
      <span class="subtitle">Upload a time series CSV or JSON, configure m, then compute.</span>
    </header>

    <div class="controls-bar">
      <${Controls}
        filename=${filename}
        pointCount=${series?.length}
        allSeries=${allSeries}
        seriesIdx=${seriesIdx}
        onSeriesChange=${handleSeriesChange}
        m=${m}
        onMChange=${setM}
        canCompute=${canCompute}
        computing=${computing}
        status=${status}
        onFile=${handleFile}
        onCompute=${handleCompute}
      />
    </div>

    <${PlotsArea}
      series=${series}
      matrixProfile=${matrixProfile}
      similaritySearch=${similaritySearch}
      m=${m}
      onPointClick=${handlePointClick}
    />
  `;
}

render(html`<${App} />`, document.getElementById('app'));

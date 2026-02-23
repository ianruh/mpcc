import { html } from 'htm/preact';
import { FileUpload } from './FileUpload.js';

const Spinner = () => html`<span class="spinner"></span>`;

// Controls bar — file upload, optional series selector, m input, compute button, status badge.
// All state lives in the parent App; this component only fires callbacks.
//
// Props:
//   filename        — loaded file name, or null
//   pointCount      — number of points in the selected series
//   allSeries       — full array of { name, values } from the loaded file
//   seriesIdx       — index of the currently selected series
//   onSeriesChange  — called with the new series index
//   m               — current subsequence length
//   onMChange       — called with the new m value
//   canCompute      — whether the compute button should be enabled
//   computing       — whether computation is in progress
//   status          — { type: 'idle'|'busy'|'success'|'error', message: string }
//   onFile          — called with a File when the user selects one
//   onCompute       — called when the user clicks Compute
export function Controls({
  filename, pointCount, allSeries, seriesIdx, onSeriesChange,
  m, onMChange, canCompute, computing, status, onFile, onCompute,
}) {
  const fileLabel = filename
    ? `${filename} · ${pointCount?.toLocaleString()} pts`
    : 'No file loaded';

  return html`
    <div class="field">
      <label>Data File</label>
      <${FileUpload} onFile=${onFile} />
      <span class="file-name">${fileLabel}</span>
    </div>

    ${allSeries.length > 1 && html`
      <div class="field">
        <label>Series</label>
        <select value=${seriesIdx} onChange=${e => onSeriesChange(Number(e.target.value))}>
          ${allSeries.map((s, i) => html`
            <option key=${s.name} value=${i}>
              ${s.name} (${s.values.length.toLocaleString()} pts)
            </option>
          `)}
        </select>
      </div>
    `}

    <div class="field">
      <label>Subsequence Length (m)</label>
      <input type="number" min="4" max="100000" defaultValue=${m}
        onInput=${e => {
          const v = parseInt(e.target.value, 10);
          if (!isNaN(v)) onMChange(v);
        }}
      />
    </div>

    <button class="btn" disabled=${!canCompute} onClick=${onCompute}>
      ${computing ? html`<${Spinner} /> Computing…` : 'Compute Matrix Profile'}
    </button>

    <span class=${'status-badge' + (status.type ? ' ' + status.type : '')}>
      ${status.message}
    </span>
  `;
}

import { html } from 'htm/preact';

const UploadIcon = () => html`
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" stroke-width="2"
       stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/>
    <line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
`;

// Drag-and-drop / click-to-browse file upload zone.
// onFile(File) is called when the user selects or drops a file.
export function FileUpload({ onFile }) {
  function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
  }

  function handleDragLeave(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
  }

  function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (file) onFile(file);
  }

  function handleChange(e) {
    const file = e.target.files?.[0];
    if (file) onFile(file);
    e.target.value = ''; // allow re-selecting the same file
  }

  return html`
    <label class="dropzone"
      onDragOver=${handleDragOver} onDragEnter=${handleDragOver}
      onDragLeave=${handleDragLeave} onDrop=${handleDrop}
    >
      <${UploadIcon} />
      Upload CSV / JSON
      <input type="file" accept=".csv,.json,.tsv,.txt" onChange=${handleChange} />
    </label>
  `;
}

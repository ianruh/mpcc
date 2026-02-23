// Pure functions for parsing CSV and JSON time series files.
// Each function returns { name: string, values: number[] }[].

function detectDelimiter(line) {
  return [',', ';', '\t'].reduce(
    (best, d) => (line.split(d).length > line.split(best).length ? d : best),
    ','
  );
}

export function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) throw new Error('File is empty');

  const delim      = detectDelimiter(lines[0]);
  const firstCells = lines[0].split(delim).map(c => c.trim().replace(/^"|"$/g, ''));
  const hasHeader  = firstCells.some(c => c !== '' && isNaN(Number(c)));
  const headers    = hasHeader ? firstCells : firstCells.map((_, i) => `Column ${i + 1}`);
  const dataLines  = lines.slice(hasHeader ? 1 : 0);

  if (dataLines.length === 0) throw new Error('No data rows found');

  const series = headers.map((name, j) => {
    const values = [];
    for (const line of dataLines) {
      const raw = (line.split(delim)[j] ?? '').trim().replace(/^"|"$/g, '');
      if (raw === '') continue;
      const v = Number(raw);
      if (isNaN(v)) return null;
      values.push(v);
    }
    return values.length > 0 ? { name, values } : null;
  }).filter(Boolean);

  if (series.length === 0) throw new Error('No numeric columns found in file');
  return series;
}

export function parseJson(text) {
  let data;
  try { data = JSON.parse(text); }
  catch (e) { throw new Error(`Invalid JSON: ${e.message}`); }

  if (Array.isArray(data)) {
    if (data.length === 0) throw new Error('JSON array is empty');

    if (typeof data[0] === 'number') {
      return [{ name: 'Series', values: data }];
    }

    if (typeof data[0] === 'object' && data[0] !== null) {
      const keys = Object.keys(data[0]).filter(k =>
        data.every(obj => {
          const v = obj[k];
          return v !== null && v !== undefined && String(v).trim() !== '' && !isNaN(Number(v));
        })
      );
      if (keys.length === 0) throw new Error('No fully-numeric fields found in JSON objects');
      return keys.map(key => ({ name: key, values: data.map(obj => Number(obj[key])) }));
    }
  }

  if (typeof data === 'object' && data !== null) {
    const series = Object.entries(data)
      .filter(([, v]) => Array.isArray(v) && v.length > 0 && v.every(x => typeof x === 'number'))
      .map(([name, values]) => ({ name, values }));
    if (series.length > 0) return series;
  }

  throw new Error(
    'Unsupported JSON format. Expected an array of numbers, an array of objects with '
    + 'numeric fields, or an object whose values are numeric arrays.'
  );
}

export async function parseFile(file) {
  const text    = await file.text();
  const ext     = file.name.split('.').pop().toLowerCase();
  const trimmed = text.trim();

  if (ext === 'json') return parseJson(text);
  if (['csv', 'tsv', 'txt'].includes(ext)) return parseCsv(text);
  return (trimmed.startsWith('[') || trimmed.startsWith('{')) ? parseJson(text) : parseCsv(text);
}

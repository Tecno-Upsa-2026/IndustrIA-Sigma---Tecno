import fs from 'fs';
import path from 'path';

const CONFIG_COLUMNS = [
  'process', 'machine_id', 'machine_name', 'line', 'var_name', 'var_type', 'unit',
  'base_value', 'noise', 'spring', 'min', 'max', 'warn', 'crit',
  'quality_target', 'quality_usl', 'quality_lsl', 'quality_cp',
];

const DATA_COLUMNS = ['ts', 'machine_id', 'var_name', 'value'];

function splitLine(line) {
  return line.split(',').map(value => value.trim());
}

function parseRow(columns, line) {
  const values = splitLine(line);
  return Object.fromEntries(columns.map((column, index) => [column, values[index] ?? '']));
}

export function loadCSV(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);

  const dataIndex = lines.findIndex(line => line === '#DATA');
  const wideIndex = lines.findIndex(line => line === '#WIDE_DATA');

  // ── Config lines: before #DATA, strip leading # ────────────────────────────
  const configLines = dataIndex >= 0 ? lines.slice(0, dataIndex) : lines;
  const configRows = configLines
    .map(line => line.startsWith('#') ? line.slice(1) : line)
    .filter(line => !line.startsWith('#') && line.trim())
    .map(line => parseRow(CONFIG_COLUMNS, line))
    .filter(row => row.process && row.machine_id && row.var_name
      && row.process !== 'process' && row.machine_id !== 'machine_id');

  // ── Data (long) lines: between #DATA and next # marker ─────────────────────
  let dataRaw = [];
  if (dataIndex >= 0) {
    const dataStart = dataIndex + 1;
    const dataEnd = wideIndex > dataIndex ? wideIndex : lines.length;
    dataRaw = lines.slice(dataStart, dataEnd);
  }

  const dataHeaderIdx = dataRaw.findIndex(line => line.startsWith('ts,'));
  const dataBody = dataHeaderIdx >= 0 ? dataRaw.slice(dataHeaderIdx + 1) : [];

  const dataRows = dataBody
    .filter(line => !line.startsWith('#'))
    .map(line => parseRow(DATA_COLUMNS, line))
    .map(row => ({
      ts: Number(row.ts),
      machine_id: row.machine_id,
      var_name: row.var_name,
      value: Number(row.value),
    }))
    .filter(row => Number.isFinite(row.ts) && row.machine_id && row.var_name && Number.isFinite(row.value));

  return { configRows, dataRows };
}

export function loadCSVDir(dirPath) {
  const names = fs.readdirSync(dirPath)
    .filter(f => f.endsWith('.csv'))
    .filter(f => !f.startsWith('maquinaria_completa'));

  const allConfigRows = [];
  const allDataRows = [];

  for (const name of names) {
    const fp = path.join(dirPath, name);
    try {
      const { configRows, dataRows } = loadCSV(fp);
      allConfigRows.push(...configRows);
      allDataRows.push(...dataRows);
    } catch (e) {
      console.warn(`  [CSV] Saltando ${name}: ${e.message}`);
    }
  }

  return { configRows: allConfigRows, dataRows: allDataRows };
}

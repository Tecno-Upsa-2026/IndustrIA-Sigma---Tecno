import fs from 'fs';

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

  const configLines = dataIndex >= 0 ? lines.slice(0, dataIndex) : lines;
  const dataLines = dataIndex >= 0 ? lines.slice(dataIndex + 1) : [];

  const configRows = configLines
    .filter(line => !line.startsWith('#'))
    .map(line => parseRow(CONFIG_COLUMNS, line))
    .filter(row => row.process && row.machine_id && row.var_name && row.process !== 'process' && row.machine_id !== 'machine_id');

  const dataHeaderIndex = dataLines.findIndex(line => line.startsWith('ts,'));
  const dataBody = dataHeaderIndex >= 0 ? dataLines.slice(dataHeaderIndex + 1) : dataLines;

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

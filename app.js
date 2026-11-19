import { MAX_FILE_BYTES, parseGif } from './gif-parser.js';
import { compareTarget, loopLabel } from './targets.js';

const byId = (id) => document.getElementById(id);
const fileInput = byId('file');
const results = byId('results');
const error = byId('error');
const status = byId('status');
const targets = ['target-width', 'target-height', 'target-size'].map(byId);
let specs = null;
let selection = 0;

function clearResults() {
  specs = null;
  results.hidden = true;
  byId('filename').textContent = '';
  byId('metadata').replaceChildren();
  byId('comparisons').replaceChildren();
  error.hidden = true;
  error.textContent = '';
  status.textContent = '';
}

function renderComparisons() {
  if (!specs) return;
  const checks = [
    ['Width', specs.width, targets[0], 1, 'px'],
    ['Height', specs.height, targets[1], 1, 'px'],
    ['File size', specs.sizeBytes, targets[2], 1024, 'bytes'],
  ];
  byId('comparisons').replaceChildren(...checks.map(([label, actual, input, multiplier, unit]) => {
    const check = input.validity.badInput || !input.validity.valid
      ? { status: 'invalid' } : compareTarget(actual, input.value, multiplier);
    const row = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = label;
    const value = document.createElement('span');
    value.className = check.status;
    if (check.status === 'unset') value.textContent = 'No target';
    else if (check.status === 'invalid') value.textContent = 'Invalid target: enter a positive whole number within the field limits.';
    else {
      const delta = check.delta > 0 ? `+${check.delta}` : String(check.delta);
      value.textContent = `${check.status.toUpperCase()} - ${actual} / ${check.limit} ${unit}; delta ${delta} ${unit}`;
    }
    row.append(name, value);
    return row;
  }));
}

async function inspect(files) {
  const request = ++selection;
  clearResults();
  try {
    if (files.length !== 1) throw new Error('Choose exactly one GIF file.');
    const file = files[0];
    if (file.size > MAX_FILE_BYTES) throw new Error('File exceeds the 20 MiB limit.');
    status.textContent = 'Checking...';
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (request !== selection) return;
    specs = parseGif(bytes);
    byId('filename').textContent = file.name;
    const rows = [
      ['Canvas', `${specs.width} x ${specs.height} px`],
      ['File size', `${specs.sizeBytes} bytes / ${(specs.sizeBytes / 1024).toFixed(3)} KiB / ${(specs.sizeBytes / 1048576).toFixed(3)} MiB`],
      ['Image frames', String(specs.frameCount)],
      ['Declared duration', `${specs.durationMs} ms (${specs.durationMs / 1000} s)`],
      ['Loop', loopLabel(specs.loopCount)],
    ];
    for (const [label, value] of rows) {
      const term = document.createElement('dt');
      const detail = document.createElement('dd');
      term.textContent = label;
      detail.textContent = value;
      byId('metadata').append(term, detail);
    }
    renderComparisons();
    results.hidden = false;
    status.textContent = 'Metadata checked.';
  } catch (cause) {
    if (request !== selection) return;
    clearResults();
    error.textContent = cause instanceof Error ? cause.message : 'Could not read this file.';
    error.hidden = false;
  } finally {
    if (request === selection) fileInput.value = '';
  }
}

fileInput.addEventListener('change', () => {
  if (fileInput.files.length) inspect(Array.from(fileInput.files));
});
for (const input of targets) input.addEventListener('input', renderComparisons);
byId('reset').addEventListener('click', () => {
  selection++;
  clearResults();
  fileInput.value = '';
  for (const input of targets) input.value = '';
  fileInput.focus();
});
const dropZone = byId('drop-zone');
document.addEventListener('dragover', (event) => event.preventDefault());
document.addEventListener('drop', (event) => event.preventDefault());
dropZone.addEventListener('dragover', () => dropZone.classList.add('dragging'));
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
dropZone.addEventListener('drop', (event) => {
  dropZone.classList.remove('dragging');
  inspect(Array.from(event.dataTransfer.files));
});

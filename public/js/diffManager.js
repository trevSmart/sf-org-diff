import { MonacoDiffEditor } from './diffEditors/monacoAdapter.js';
import { CodeMirrorDiffEditor } from './diffEditors/codeMirrorAdapter.js';

const STORAGE_KEY = 'orgdiff_diff_editor';

const adapters = {
  monaco: new MonacoDiffEditor(),
  codemirror: new CodeMirrorDiffEditor()
};

let currentType = loadSavedType();

function loadSavedType() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && adapters[stored]) return stored;
  } catch (_err) {
    // ignore
  }
  return 'monaco';
}

export function getActiveDiffEditorType() {
  return currentType;
}

export function setActiveDiffEditorType(type) {
  if (!adapters[type]) return currentType;
  currentType = type;
  try {
    localStorage.setItem(STORAGE_KEY, type);
  } catch (_err) {
    // ignore
  }
  return currentType;
}

export async function initDiffEditor(containerId, original, modified, language, options) {
  const adapter = adapters[currentType] || adapters.monaco;
  return adapter.init(containerId, original, modified, language, options);
}

export function destroyDiffEditor() {
  const adapter = adapters[currentType] || adapters.monaco;
  if (adapter && adapter.destroy) adapter.destroy();
}

export function scrollDiffToFirstChange() {
  const adapter = adapters[currentType] || adapters.monaco;
  if (adapter && adapter.scrollToFirstDifference) {
    adapter.scrollToFirstDifference();
  }
}

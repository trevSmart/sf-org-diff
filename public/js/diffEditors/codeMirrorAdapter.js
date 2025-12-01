import { BaseDiffEditor } from './baseDiffEditor.js';
import { MergeView } from '@codemirror/merge';
import { basicSetup } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { xml } from '@codemirror/lang-xml';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { EditorView } from '@codemirror/view';

function resolveLanguageExtension(language) {
  const lang = (language || '').toLowerCase();
  if (lang.includes('apex')) return javascript();
  if (lang.includes('javascript')) return javascript();
  if (lang.includes('xml')) return xml();
  if (lang.includes('html')) return html();
  if (lang.includes('css')) return css();
  if (lang.includes('json')) return json();
  return []; // fallback plain text
}

/**
 * Creates a custom revert control button with FontAwesome icons.
 * The button allows copying content from one editor to the other.
 * @returns {HTMLElement} The revert control button element
 */
function createRevertControlButton(onResolved) {
  const button = document.createElement('button');
  button.className = 'cm-revert-control-btn';
  button.type = 'button';
  button.title = 'Copiar a Org B';

  // Use FontAwesome arrow icon
  const icon = document.createElement('i');
  icon.className = 'fas fa-arrow-right';
  button.appendChild(icon);

  if (typeof onResolved === 'function') {
    button.addEventListener('click', () => {
      // Deixar que CodeMirror faci el revert i després marcar com resolt
      setTimeout(() => {
        try {
          onResolved();
        } catch (_err) {
          // ignore errors in callback
        }
      }, 0);
    });
  }

  return button;
}

export class CodeMirrorDiffEditor extends BaseDiffEditor {
  constructor() {
    super();
    this.view = null;
    this.onResolved = null;
  }

  async init(containerId, originalContent, modifiedContent, language, options) {
    const container = document.getElementById(containerId);
    if (!container) throw new Error(`Container ${containerId} not found`);

    container.innerHTML = '';
    this.onResolved = options && typeof options.onResolved === 'function' ? options.onResolved : null;
    const languageExt = resolveLanguageExtension(language);

    this.view = new MergeView({
      // Editors A i B en mode només lectura; només es poden modificar mitjançant els controls de revert
      a: { doc: originalContent, extensions: [basicSetup, languageExt, EditorView.editable.of(false)].flat() },
      b: { doc: modifiedContent, extensions: [basicSetup, languageExt, EditorView.editable.of(false)].flat() },
      parent: container,
      orientation: 'a-b',
      // Enable revert controls: clicking copies content from Org A to Org B
      revertControls: 'a-to-b',
      // Custom render function for the revert button
      renderRevertControl: () => createRevertControlButton(this.onResolved),
      // Highlight changed text within chunks
      highlightChanges: true,
      // Show gutter markers next to changed lines
      gutter: true,
      // Collapse long unchanged sections
      collapseUnchanged: { margin: 3, minSize: 4 }
    });

    return this.view;
  }

  /**
   * Scrolls to the first difference in the merge view.
   * Uses the chunks API to find the first changed section.
   */
  scrollToFirstDifference() {
    if (!this.view) return;

    // Get the chunks from the merge view (may not exist if no differences)
    const chunks = this.view.chunks;
    if (!chunks || !Array.isArray(chunks) || chunks.length === 0) return;

    // Get the first chunk and scroll to it in editor B
    const firstChunk = chunks[0];
    const editorB = this.view.b;

    if (editorB && firstChunk && typeof firstChunk.fromB === 'number') {
      // Scroll to the start of the first change in editor B
      const pos = firstChunk.fromB;
      editorB.dispatch({
        effects: EditorView.scrollIntoView(pos, { y: 'center' })
      });
    }
  }

  destroy() {
    if (this.view && this.view.destroy) {
      this.view.destroy();
    }
    this.view = null;
  }
}

import { BaseDiffEditor } from './baseDiffEditor.js';
import { MergeView } from '@codemirror/merge';
import { basicSetup } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { xml } from '@codemirror/lang-xml';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';

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

export class CodeMirrorDiffEditor extends BaseDiffEditor {
  constructor() {
    super();
    this.view = null;
  }

  async init(containerId, originalContent, modifiedContent, language) {
    const container = document.getElementById(containerId);
    if (!container) throw new Error(`Container ${containerId} not found`);

    container.innerHTML = '';
    const languageExt = resolveLanguageExtension(language);

    this.view = new MergeView({
      a: { doc: originalContent, extensions: [basicSetup, languageExt].flat() },
      b: { doc: modifiedContent, extensions: [basicSetup, languageExt].flat() },
      parent: container,
      orientation: 'a-b'
    });

    return this.view;
  }

  destroy() {
    if (this.view && this.view.destroy) {
      this.view.destroy();
    }
    this.view = null;
  }
}

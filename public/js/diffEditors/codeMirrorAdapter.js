import { BaseDiffEditor } from './baseDiffEditor.js';
import { MergeView } from '@codemirror/merge';
import { EditorView, basicSetup } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { xml } from '@codemirror/lang-xml';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';

const libs = { MergeView, EditorView, basicSetup, javascript, xml, html, css, json };

function resolveLanguageExtension(language) {
  const lang = (language || '').toLowerCase();
  if (lang.includes('apex')) return libs.javascript();
  if (lang.includes('javascript')) return libs.javascript();
  if (lang.includes('xml')) return libs.xml();
  if (lang.includes('html')) return libs.html();
  if (lang.includes('css')) return libs.css();
  if (lang.includes('json')) return libs.json();
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

    this.view = new libs.MergeView({
      a: { doc: originalContent, extensions: [libs.basicSetup, languageExt].flat() },
      b: { doc: modifiedContent, extensions: [libs.basicSetup, languageExt].flat() },
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

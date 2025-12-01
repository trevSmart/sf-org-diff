import { BaseDiffEditor } from './baseDiffEditor.js';

const CDN_VARIANTS = [
  {
    base: 'https://cdn.jsdelivr.net/npm',
    paths: {
      core: 'codemirror@6.0.1/+esm',
      merge: '@codemirror/merge@6.5.3/+esm',
      js: '@codemirror/lang-javascript@6.2.1/+esm',
      xml: '@codemirror/lang-xml@6.1.1/+esm',
      html: '@codemirror/lang-html@6.5.5/+esm',
      css: '@codemirror/lang-css@6.2.1/+esm',
      json: '@codemirror/lang-json@6.1.2/+esm'
    }
  },
  {
    base: 'https://esm.sh',
    paths: {
      core: 'codemirror@6.0.1',
      merge: '@codemirror/merge@6.5.3',
      js: '@codemirror/lang-javascript@6.2.1',
      xml: '@codemirror/lang-xml@6.1.1',
      html: '@codemirror/lang-html@6.5.5',
      css: '@codemirror/lang-css@6.2.1',
      json: '@codemirror/lang-json@6.1.2'
    }
  },
  {
    base: 'https://cdn.skypack.dev',
    paths: {
      core: 'codemirror@6.0.1',
      merge: '@codemirror/merge@6.5.3',
      js: '@codemirror/lang-javascript@6.2.1',
      xml: '@codemirror/lang-xml@6.1.1',
      html: '@codemirror/lang-html@6.5.5',
      css: '@codemirror/lang-css@6.2.1',
      json: '@codemirror/lang-json@6.1.2'
    }
  }
];

async function tryImport(urls) {
  let lastError;
  for (const url of urls) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await import(url);
    } catch (err) {
      lastError = err;
      continue;
    }
  }
  throw lastError || new Error('Failed to import module');
}

async function loadCodeMirrorMerge() {
  let lastError;
  for (const variant of CDN_VARIANTS) {
    try {
      const [{ MergeView }, { EditorView, basicSetup }, { javascript }, { xml }, { html }, { css }, { json }] = await Promise.all([
        tryImport([`${variant.base}/${variant.paths.merge}`]),
        tryImport([`${variant.base}/${variant.paths.core}`]),
        tryImport([`${variant.base}/${variant.paths.js}`]),
        tryImport([`${variant.base}/${variant.paths.xml}`]),
        tryImport([`${variant.base}/${variant.paths.html}`]),
        tryImport([`${variant.base}/${variant.paths.css}`]),
        tryImport([`${variant.base}/${variant.paths.json}`])
      ]);
      return { MergeView, EditorView, basicSetup, javascript, xml, html, css, json };
    } catch (err) {
      lastError = err;
      // try next variant
      continue;
    }
  }
  throw lastError || new Error('Unable to load CodeMirror modules');
}

function resolveLanguageExtension(language, libs) {
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

    const libs = await loadCodeMirrorMerge();

    container.innerHTML = '';
    const languageExt = resolveLanguageExtension(language, libs);

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

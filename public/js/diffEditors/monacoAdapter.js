import { BaseDiffEditor } from './baseDiffEditor.js';

export class MonacoDiffEditor extends BaseDiffEditor {
  async init(containerId, originalContent, modifiedContent, language) {
    const { initDiffViewer } = await import('../diffViewer.js');
    return initDiffViewer(containerId, originalContent, modifiedContent, language);
  }

  destroy() {
    import('../diffViewer.js').then(({ destroyDiffViewer }) => destroyDiffViewer()).catch(() => {});
  }

  scrollToFirstDifference() {
    import('../diffViewer.js').then(({ scrollToFirstDifference }) => scrollToFirstDifference()).catch(() => {});
  }
}

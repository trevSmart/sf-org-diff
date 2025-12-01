export class BaseDiffEditor {
  // eslint-disable-next-line class-methods-use-this
  async init(_containerId, _original, _modified, _language) {
    throw new Error('Not implemented');
  }

  // eslint-disable-next-line class-methods-use-this
  destroy() {
    // optional
  }

  // eslint-disable-next-line class-methods-use-this
  scrollToFirstDifference() {
    // optional
  }
}

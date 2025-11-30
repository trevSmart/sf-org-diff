/**
 * Módulo para gestionar Monaco Editor diff viewer
 * Preparado para futuras fases cuando se implemente la comparación de componentes
 */

let monacoEditor = null;

/**
 * Inicializa Monaco Editor en modo diff
 * @param {string} containerId - ID del contenedor donde renderizar el editor
 * @param {string} originalContent - Contenido original (org A)
 * @param {string} modifiedContent - Contenido modificado (org B)
 * @param {string} language - Lenguaje para el syntax highlighting (opcional)
 */
export async function initDiffViewer(containerId, originalContent, modifiedContent, language = 'xml') {
  // Monaco Editor se carga dinámicamente
  if (typeof monaco === 'undefined') {
    // Cargar Monaco Editor desde CDN o módulo
    await loadMonacoEditor();
  }

  const container = document.getElementById(containerId);
  if (!container) {
    throw new Error(`Container with id ${containerId} not found`);
  }

  // Si ya existe un editor, destruirlo primero ANTES de limpiar el contenedor
  // Esto evita errores de "node to be removed is not a child"
  if (monacoEditor) {
    try {
      // Intentar disponer el editor de forma segura
      // Si el container ya fue limpiado, el dispose fallará pero lo capturamos
      monacoEditor.dispose();
    } catch (error) {
      // Si hay error al disponer (por ejemplo, el container ya fue limpiado),
      // solo loguear el error pero continuar - esto es normal si el container ya fue limpiado
      // No loguear como error crítico, solo como warning
      if (!error.message || !error.message.includes('not a child')) {
        console.warn('Error disposing previous editor:', error);
      }
    }
    monacoEditor = null;
  }

  // Limpiar el contenedor después de disponer el editor
  container.innerHTML = '';

  // Crear modelos para el diff
  const originalModel = monaco.editor.createModel(originalContent, language);
  const modifiedModel = monaco.editor.createModel(modifiedContent, language);

  // Crear diff editor
  monacoEditor = monaco.editor.createDiffEditor(container, {
    theme: 'vs-dark',
    readOnly: true,
    automaticLayout: true,
    renderSideBySide: true
  });

  monacoEditor.setModel({
    original: originalModel,
    modified: modifiedModel
  });

  return monacoEditor;
}

/**
 * Carga Monaco Editor dinámicamente
 */
async function loadMonacoEditor() {
  return new Promise((resolve, reject) => {
    if (typeof monaco !== 'undefined') {
      resolve();
      return;
    }

    // Cargar desde CDN
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/loader.js';
    script.onload = () => {
      if (typeof require !== 'undefined') {
        require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' } });
        require(['vs/editor/editor.main'], () => {
          resolve();
        });
      } else {
        reject(new Error('Monaco Editor loader failed to initialize'));
      }
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

/**
 * Actualiza el contenido del diff viewer
 * @param {string} originalContent - Contenido original
 * @param {string} modifiedContent - Contenido modificado
 */
export function updateDiffContent(originalContent, modifiedContent) {
  if (!monacoEditor) {
    throw new Error('Diff viewer not initialized');
  }

  const originalModel = monacoEditor.getOriginalEditor().getModel();
  const modifiedModel = monacoEditor.getModifiedEditor().getModel();

  originalModel.setValue(originalContent);
  modifiedModel.setValue(modifiedContent);
}

/**
 * Destruye el diff viewer y libera recursos
 */
export function destroyDiffViewer() {
  if (monacoEditor) {
    try {
      // Intentar disponer el editor de forma segura
      monacoEditor.dispose();
    } catch (error) {
      // Si hay error al disponer (por ejemplo, el container ya fue limpiado),
      // solo loguear el error pero continuar - esto es normal si el container ya fue limpiado
      // No loguear como error crítico, solo como warning silencioso
      if (!error.message || !error.message.includes('not a child')) {
        console.warn('Error disposing diff viewer:', error);
      }
    }
    monacoEditor = null;
  }
}

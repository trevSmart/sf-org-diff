/**
 * Módulo para gestionar Monaco Editor diff viewer
 * Preparado para futuras fases cuando se implemente la comparación de componentes
 */

let monacoEditor = null;
let resizeObserver = null;
let currentTheme = 'vs-dark'; // Default theme

const MONACO_LOCAL_BASE = '/monaco/vs';
const MONACO_CDN_BASE = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs';
const THEME_STORAGE_KEY = 'orgdiff_monaco_theme';
const LIGHT_THEME_ID = 'orgdiff-light';
const DARK_THEME_ID = 'orgdiff-dark';
const LIGHT_BG = '#ffffff';
const LIGHT_FG = '#1e1e1e';
const DARK_BG = '#1e1e1e';
const DARK_FG = '#d4d4d4';

/**
 * Carga el tema guardado desde localStorage
 * @returns {string} - Tema guardado o 'vs-dark' por defecto
 */
function loadSavedTheme() {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved === 'vs' || saved === 'vs-dark' ? saved : 'vs-dark';
  } catch (error) {
    console.error('Error loading theme from localStorage:', error);
    return 'vs-dark';
  }
}

/**
 * Guarda el tema en localStorage
 * @param {string} theme - Tema a guardar ('vs' o 'vs-dark')
 */
function saveTheme(theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (error) {
    console.error('Error saving theme to localStorage:', error);
  }
}

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
    // Cargar Monaco Editor desde la ruta local con fallback al CDN
    await loadMonacoEditor();
  }

  const container = document.getElementById(containerId);
  if (!container) {
    throw new Error(`Container with id ${containerId} not found`);
  }

  disposeEditor();

  // Limpiar el contenedor después de disponer el editor
  container.innerHTML = '';

  // Asegurar que el contenedor tenga dimensiones visibles
  // Forzar width y height al 100% para que el editor pueda calcular correctamente sus dimensiones
  container.style.width = '100%';
  container.style.height = '100%';

  // Obtener el contenedor padre (diff-panel) para asegurar que también tenga dimensiones
  const parentPanel = container.closest('.diff-panel');
  if (parentPanel) {
    // Asegurar que el panel padre tenga dimensiones visibles
    const panelRect = parentPanel.getBoundingClientRect();
    if (panelRect.width === 0 || panelRect.height === 0) {
      // Si el panel no tiene dimensiones, forzar un layout
      parentPanel.style.display = 'flex';
      parentPanel.style.flexDirection = 'column';
    }
  }

  // Esperar un frame para que el layout se actualice
  await new Promise(resolve => requestAnimationFrame(resolve));

  const languageId = resolveLanguage(language);

  // Cargar tema guardado
  currentTheme = loadSavedTheme();

  defineThemes();

  // Establecer el tema globalmente antes de crear el editor
  // Esto asegura que todos los componentes, incluyendo el minimap, usen el tema correcto
  monaco.editor.setTheme(getMonacoThemeId(currentTheme));
  applyContainerBackground(container, currentTheme);

  // Crear modelos para el diff
  const originalModel = monaco.editor.createModel(originalContent, languageId);
  const modifiedModel = monaco.editor.createModel(modifiedContent, languageId);

  // Crear diff editor
  monacoEditor = monaco.editor.createDiffEditor(container, {
    theme: getMonacoThemeId(currentTheme),
    readOnly: true,
    automaticLayout: true,
    renderSideBySide: true,
    fontSize: 11.5,
    minimap: {
      enabled: true,
      renderCharacters: false
    },
    scrollBeyondLastLine: false
  });

  monacoEditor.setModel({
    original: originalModel,
    modified: modifiedModel
  });

  // Ajustar layout cuando el contenedor cambie de tamaño (resizer, sticky, etc.)
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      if (monacoEditor) {
        // Forzar layout cuando el contenedor cambia de tamaño
        monacoEditor.layout();
      }
    });
    resizeObserver.observe(container);

    // También observar el panel padre si existe
    if (parentPanel) {
      resizeObserver.observe(parentPanel);
    }
  }

  // Forzar layout después de que el editor se haya renderizado
  // Usar múltiples timeouts para asegurar que el layout se actualice correctamente
  const forceLayout = () => {
    if (monacoEditor) {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        monacoEditor.layout();
      }
    }
  };

  // Revalidar y forzar layout tras el primer render
  setTimeout(forceLayout, 50);
  setTimeout(forceLayout, 100);
  setTimeout(forceLayout, 200);

  return monacoEditor;
}

/**
 * Hace scroll automático a la primera diferencia en el diff viewer
 */
export function scrollToFirstDifference() {
  if (!monacoEditor) {
    return;
  }

  try {
    // Obtener las diferencias entre los dos modelos
    const lineChanges = monacoEditor.getLineChanges();

    if (lineChanges && lineChanges.length > 0) {
      // Obtener la primera diferencia
      const firstChange = lineChanges[0];

      // Usar la línea del modelo modificado (org B) para hacer scroll
      // Si no está disponible, usar la del modelo original
      const lineNumber = firstChange.modifiedStartLineNumber || firstChange.originalStartLineNumber;

      if (lineNumber && lineNumber > 0) {
        // Hacer scroll a la línea en el editor modificado (derecha)
        const modifiedEditor = monacoEditor.getModifiedEditor();
        modifiedEditor.revealLineInCenter(lineNumber);

        // También hacer scroll en el editor original para mantener sincronización
        const originalEditor = monacoEditor.getOriginalEditor();
        const originalLineNumber = firstChange.originalStartLineNumber || lineNumber;
        if (originalLineNumber > 0) {
          originalEditor.revealLineInCenter(originalLineNumber);
        }
      }
    }
  } catch (error) {
    console.warn('Error scrolling to first difference:', error);
  }
}

/**
 * Carga Monaco Editor dinámicamente
 */
async function loadMonacoEditor() {
  // Intentar primero la ruta local y luego el CDN como fallback
  const bases = [MONACO_LOCAL_BASE, MONACO_CDN_BASE];

  for (const base of bases) {
    try {
      await loadFromBase(base);
      return;
    } catch (error) {
      console.warn(`Failed to load Monaco from ${base}:`, error);
    }
  }

  throw new Error('Monaco Editor could not be loaded from local or CDN');
}

function loadFromBase(basePath) {
  return new Promise((resolve, reject) => {
    if (typeof monaco !== 'undefined') {
      resolve();
      return;
    }

    // Evitar cargar múltiples veces el mismo loader
    const existingScript = document.querySelector('script[data-monaco-loader]');
    if (existingScript && existingScript.dataset.base === basePath) {
      existingScript.addEventListener('load', () => resolve());
      existingScript.addEventListener('error', (err) => reject(err));
      return;
    }

    const script = document.createElement('script');
    script.src = `${basePath}/loader.js`;
    script.async = true;
    script.dataset.monacoLoader = 'true';
    script.dataset.base = basePath;

    script.onload = () => {
      if (typeof require === 'undefined') {
        reject(new Error('Monaco Editor loader failed to initialize'));
        return;
      }

      self.MonacoEnvironment = {
        ...(self.MonacoEnvironment || {}),
        getWorkerUrl: () => `${basePath}/base/worker/workerMain.js`
      };

      require.config({ paths: { vs: basePath } });
      require([
        'vs/editor/editor.main'
      ], () => resolve(), reject);
    };

    script.onerror = (err) => {
      script.remove();
      reject(err);
    };

    document.head.appendChild(script);
  });
}

function resolveLanguage(language) {
  if (typeof monaco === 'undefined') {
    return 'plaintext';
  }

  const lang = (language || 'plaintext').toLowerCase();
  const registeredIds = monaco.languages.getLanguages().map(l => l.id);

  if (!registeredIds.includes(lang)) {
    monaco.languages.register({ id: lang });
  }

  return lang;
}

function defineThemes() {
  if (typeof monaco === 'undefined' || !monaco.editor || !monaco.editor.defineTheme) {
    return;
  }

  monaco.editor.defineTheme(LIGHT_THEME_ID, {
    base: 'vs',
    inherit: true,
    colors: {
      'editor.background': LIGHT_BG,
      'editor.foreground': LIGHT_FG,
      'editorLineNumber.foreground': '#237893',
      'editorGutter.background': LIGHT_BG,
      'minimap.background': '#f7f7f7',
      'minimap.foreground': '#8f8f8f',
      'minimap.selectionHighlight': '#c9c9c9',
      'minimapSlider.background': '#c9c9c933',
      'minimapSlider.hoverBackground': '#c9c9c944',
      'minimapSlider.activeBackground': '#c9c9c966'
    },
    rules: [
      { token: '', foreground: LIGHT_FG.replace('#', '') }
    ]
  });

  monaco.editor.defineTheme(DARK_THEME_ID, {
    base: 'vs-dark',
    inherit: true,
    colors: {
      'editor.background': DARK_BG,
      'editor.foreground': DARK_FG,
      'editorLineNumber.foreground': '#8dc2ff',
      'editorGutter.background': DARK_BG,
      'minimap.background': '#1e1e1e',
      'minimap.foreground': '#888888',
      'minimap.selectionHighlight': '#3a3a3a',
      'minimapSlider.background': '#66666655',
      'minimapSlider.hoverBackground': '#66666677',
      'minimapSlider.activeBackground': '#666666aa'
    },
    rules: [
      { token: '', foreground: DARK_FG.replace('#', '') }
    ]
  });
}

function getMonacoThemeId(theme) {
  return theme === 'vs' ? LIGHT_THEME_ID : DARK_THEME_ID;
}

function applyContainerBackground(containerNode, theme) {
  if (!containerNode) return;
  const isLight = theme === 'vs';
  const bg = isLight ? LIGHT_BG : DARK_BG;
  const fg = isLight ? LIGHT_FG : DARK_FG;
  containerNode.style.backgroundColor = bg;
  containerNode.style.color = fg;
}

function disposeEditor() {
  if (resizeObserver) {
    try {
      resizeObserver.disconnect();
    } catch (_err) {
      // ignore
    }
    resizeObserver = null;
  }

  // Si ya existe un editor, destruirlo primero ANTES de limpiar el contenedor
  // Esto evita errores de "node to be removed is not a child"
  if (monacoEditor) {
    try {
      monacoEditor.dispose();
    } catch (error) {
      if (!error.message || !error.message.includes('not a child')) {
        console.warn('Error disposing previous editor:', error);
      }
    }
    monacoEditor = null;
  }
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
 * Cambia el tema del editor entre claro y oscuro
 * @returns {string} - El nuevo tema aplicado
 */
export function toggleTheme() {
  // Alternar entre 'vs' (claro) y 'vs-dark' (oscuro) SIEMPRE,
  // aunque todavía no se haya inicializado Monaco.
  currentTheme = currentTheme === 'vs-dark' ? 'vs' : 'vs-dark';

  // Aplicar el nuevo tema globalmente en Monaco si está disponible.
  // Esto asegura que todos los componentes, incluyendo el minimap, usen el tema correcto.
  if (typeof monaco !== 'undefined') {
    defineThemes();
    monaco.editor.setTheme(getMonacoThemeId(currentTheme));
  }

  // Si el diff viewer de Monaco está inicializado, actualizar también sus opciones
  // y el fondo del contenedor. Si no lo está (por ejemplo, si se está usando
  // CodeMirror o aún no se ha abierto ningún diff), simplemente se guarda la
  // preferencia para usarla más adelante.
  if (monacoEditor) {
    monacoEditor.updateOptions({
      theme: getMonacoThemeId(currentTheme)
    });

    applyContainerBackground(monacoEditor.getContainerDomNode(), currentTheme);
  }

  // Guardar preferencia
  saveTheme(currentTheme);

  return currentTheme;
}

/**
 * Obtiene el tema actual
 * @returns {string} - Tema actual ('vs' o 'vs-dark')
 */
export function getCurrentTheme() {
  return currentTheme;
}

/**
 * Establece el tema del editor
 * @param {string} theme - Tema a aplicar ('vs' o 'vs-dark')
 */
export function setTheme(theme) {
  if (theme !== 'vs' && theme !== 'vs-dark') {
    console.warn(`Invalid theme: ${theme}. Using 'vs-dark' instead.`);
    theme = 'vs-dark';
  }

  if (!monacoEditor) {
    currentTheme = theme;
    saveTheme(theme);
    return;
  }

  currentTheme = theme;

  // Aplicar el tema usando setTheme para asegurar que todos los componentes se actualicen
  if (typeof monaco !== 'undefined') {
    defineThemes();
    monaco.editor.setTheme(getMonacoThemeId(currentTheme));
  }

  monacoEditor.updateOptions({
    theme: getMonacoThemeId(currentTheme)
  });

  applyContainerBackground(monacoEditor.getContainerDomNode(), currentTheme);
  saveTheme(currentTheme);
}

/**
 * Destruye el diff viewer y libera recursos
 */
export function destroyDiffViewer() {
  disposeEditor();
}

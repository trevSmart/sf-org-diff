/**
 * Módulo para gestionar el redimensionamiento del treeview container
 */

const STORAGE_KEY = 'orgdiff_treeview_width';

/**
 * Inicializa el resizer para redimensionar el treeview container
 */
export function initResizer() {
  const resizer = document.getElementById('resizer');
  const treeviewContainer = document.getElementById('treeviewContainer');
  const mainContent = document.querySelector('.main-content');

  if (!resizer || !treeviewContainer || !mainContent) {
    console.warn('Resizer elements not found');
    return;
  }

  // Cargar ancho guardado desde localStorage
  const savedWidth = localStorage.getItem(STORAGE_KEY);
  if (savedWidth) {
    const width = parseFloat(savedWidth);
    if (width && width > 0) {
      // Si el valor guardado es menor a 100, asumimos que es un porcentaje
      // Si es mayor o igual a 100, asumimos que son píxeles
      if (width < 100) {
        treeviewContainer.style.width = `${width}%`;
      } else {
        treeviewContainer.style.width = `${width}px`;
      }
    }
  } else {
    // Si no hay valor guardado, usar el ancho por defecto de 340px
    treeviewContainer.style.width = '340px';
  }

  let isResizing = false;
  let startX = 0;
  let startWidth = 0;

  /**
   * Inicia el redimensionamiento
   */
  function startResize(e) {
    isResizing = true;
    startX = e.clientX;
    startWidth = treeviewContainer.offsetWidth;
    resizer.classList.add('resizing');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  }

  /**
   * Realiza el redimensionamiento durante el drag
   */
  function doResize(e) {
    if (!isResizing) return;

    const mainContentWidth = mainContent.offsetWidth;
    const deltaX = e.clientX - startX;
    const newWidth = startWidth + deltaX;
    const newWidthPercent = (newWidth / mainContentWidth) * 100;

    // Limitar el ancho entre min y max
    const minPixels = 300; // 300px mínimo
    const maxPercent = 70; // 70% máximo
    const minPercent = (minPixels / mainContentWidth) * 100;

    let finalWidthPercent = newWidthPercent;

    // Aplicar límites
    if (newWidthPercent < minPercent) {
      finalWidthPercent = minPercent;
    } else if (newWidthPercent > maxPercent) {
      finalWidthPercent = maxPercent;
    }

    treeviewContainer.style.width = `${finalWidthPercent}%`;
  }

  /**
   * Finaliza el redimensionamiento
   */
  function stopResize() {
    if (!isResizing) return;

    isResizing = false;
    resizer.classList.remove('resizing');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    // Rehabilitar interacción con Monaco Editor después del drag
    const diffViewer = document.getElementById('diffViewer');
    if (diffViewer) {
      diffViewer.style.pointerEvents = '';
    }

    // Guardar el ancho en localStorage (en píxels)
    const currentWidth = treeviewContainer.offsetWidth;
    localStorage.setItem(STORAGE_KEY, currentWidth.toString());
  }

  /**
   * Restablece el ancho al valor por defecto (340px)
   */
  function resetToDefaultWidth() {
    treeviewContainer.style.width = '340px';
    localStorage.removeItem(STORAGE_KEY);
  }

  /**
   * Previene que los eventos de drag lleguen a Monaco Editor durante el resize
   */
  function preventMonacoDragEvents(e) {
    if (!isResizing) return;

    const diffViewer = document.getElementById('diffViewer');
    if (diffViewer && diffViewer.contains(e.target)) {
      e.stopPropagation();
      e.preventDefault();
    }
  }

  // Event listeners
  resizer.addEventListener('mousedown', startResize);
  document.addEventListener('mousemove', doResize);
  document.addEventListener('mouseup', stopResize);

  // Prevenir eventos de drag sobre Monaco durante el resize
  document.addEventListener('dragstart', preventMonacoDragEvents, true);
  document.addEventListener('drag', preventMonacoDragEvents, true);
  document.addEventListener('dragend', preventMonacoDragEvents, true);
  document.addEventListener('mouseleave', (e) => {
    if (isResizing) {
      const diffViewer = document.getElementById('diffViewer');
      if (diffViewer && diffViewer.contains(e.target)) {
        e.stopPropagation();
      }
    }
  }, true);

  // Doble clic para restablecer al ancho por defecto
  resizer.addEventListener('dblclick', resetToDefaultWidth);

  // Prevenir selección de texto durante el drag
  resizer.addEventListener('selectstart', (e) => e.preventDefault());
}

import { TreeView } from './treeView.js';
import { initResizer } from './resizer.js';
import { setActiveDiffEditorType, getActiveDiffEditorType, destroyDiffEditor } from './diffManager.js';

// Constantes
const STORAGE_KEY = 'orgdiff_orgs_list';
const DEV_MODE = false; // Cambiar a false para producción

// Estado de la aplicación
let selectedOrgA = null;
let selectedOrgB = null;
let orgsList = [];
let treeView = null;

// Elementos del DOM
const screen1 = document.getElementById('screen1');
const screen2 = document.getElementById('screen2');
const orgASelect = document.getElementById('orgA');
const orgBSelect = document.getElementById('orgB');
const continueBtn = document.getElementById('continueBtn');
const refreshOrgsBtn = document.getElementById('refreshOrgsBtn');
const errorMessage = document.getElementById('errorMessage');
const orgAInfo = document.getElementById('orgAInfo');
const orgBInfo = document.getElementById('orgBInfo');
const loadingMessage = document.getElementById('loadingMessage');
const metadataTypeFilter = document.getElementById('metadataTypeFilter');
const componentFilter = document.getElementById('componentFilter');
const metadataTypeSuggestions = document.getElementById('metadataTypeSuggestions');
const clearTypeFilterBtn = document.getElementById('clearTypeFilterBtn');
const clearComponentFilterBtn = document.getElementById('clearComponentFilterBtn');
const diffEditorSelect = document.getElementById('diffEditorSelect');
const backBtn = document.getElementById('backBtn');
const closeDiffBtn = document.getElementById('closeDiffBtn');
const metadataTypesWarning = document.getElementById('metadataTypesWarning');
const devModeIndicator = document.getElementById('devModeIndicator');
let metadataTypeNames = [];

// Inicializar selector de editor de diff
if (diffEditorSelect) {
  diffEditorSelect.value = getActiveDiffEditorType();
  diffEditorSelect.addEventListener('change', (e) => {
    setActiveDiffEditorType(e.target.value);
  });
}

// Mostrar indicador de modo DEV si está activo
if (DEV_MODE && devModeIndicator) {
  devModeIndicator.style.display = 'flex';
  // Ajustar el margin-top del body para que el contenido no quede oculto bajo el indicador
  // El indicador tiene ~36px de altura (padding 8px*2 + contenido)
  document.body.style.marginTop = '54px'; // 18px (margin original) + 36px (altura indicador)
}

/**
 * Guarda la lista de orgs en localStorage
 */
function saveOrgsToStorage(orgs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orgs));
  } catch (error) {
    console.error('Error saving orgs to localStorage:', error);
  }
}

/**
 * Carga la lista de orgs desde localStorage
 */
function loadOrgsFromStorage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Error loading orgs from localStorage:', error);
  }
  return null;
}

/**
 * Carga la lista de orgs desde el servidor
 * @param {boolean} forceRefresh - Si es true, ignora el cache y fuerza la actualización
 * @returns {Promise<void>}
 */
async function loadOrgs(_forceRefresh = false) {
  // Mostrar mensaje de carga con indicador animado y deshabilitar combos
  loadingMessage.innerHTML = '<span class="loading-spinner"></span> Cargando orgs de Salesforce...';
  loadingMessage.style.display = 'block';
  refreshOrgsBtn.classList.add('disabled');
  orgASelect.disabled = true;
  orgBSelect.disabled = true;

  // Hacer la carga asíncrona sin bloquear la UI
  try {
    const response = await fetch('/api/orgs');
    const data = await response.json();

    if (data.success && data.orgs) {
      orgsList = data.orgs;
      // Guardar en localStorage
      saveOrgsToStorage(orgsList);
      populateOrgSelects();
      // Ocultar mensaje de carga y habilitar combos
      loadingMessage.style.display = 'none';
      loadingMessage.textContent = 'Cargando orgs de Salesforce...'; // Restaurar texto original
      refreshOrgsBtn.classList.remove('disabled');
      orgASelect.disabled = false;
      orgBSelect.disabled = false;
    } else {
      showError('Error al cargar la lista de orgs');
      // Ocultar mensaje de carga pero mantener combos deshabilitados
      loadingMessage.style.display = 'none';
      loadingMessage.textContent = 'Cargando orgs de Salesforce...'; // Restaurar texto original
      refreshOrgsBtn.classList.remove('disabled');
      orgASelect.disabled = true;
      orgBSelect.disabled = true;
    }
  } catch (error) {
    console.error('Error loading orgs:', error);
    showError('Error al conectar con el servidor');
    // Ocultar mensaje de carga pero mantener combos deshabilitados
    loadingMessage.style.display = 'none';
    refreshOrgsBtn.classList.remove('disabled');
    orgASelect.disabled = true;
    orgBSelect.disabled = true;
  }
}

/**
 * Inicializa la lista de orgs desde localStorage o servidor
 */
function initializeOrgs() {
  // Intentar cargar desde localStorage primero
  const storedOrgs = loadOrgsFromStorage();

  if (storedOrgs && storedOrgs.length > 0) {
    // Usar orgs del localStorage
    orgsList = storedOrgs;
    populateOrgSelects();
    loadingMessage.style.display = 'none';
    refreshOrgsBtn.classList.remove('disabled');
    orgASelect.disabled = false;
    orgBSelect.disabled = false;
    console.log(`Cargadas ${orgsList.length} orgs desde localStorage`);

    // Si estamos en dev mode, saltar directamente a la pantalla 2
    if (DEV_MODE) {
      autoLoadDevMode();
    }
  } else {
    // No hay orgs en localStorage, cargar desde el servidor
    loadOrgs().then(() => {
      // Después de cargar, si estamos en dev mode, saltar a pantalla 2
      if (DEV_MODE) {
        autoLoadDevMode();
      }
    });
  }
}

/**
 * Carga automáticamente las orgs por defecto y muestra la pantalla 2 en modo dev
 */
async function autoLoadDevMode() {
  // Buscar las orgs por defecto
  const vodafoneDevOrg = orgsList.find(org => {
    const alias = org.alias || org.username;
    return alias === 'Vodafone - dev11pro';
  });

  const vodafoneQaOrg = orgsList.find(org => {
    const alias = org.alias || org.username;
    return alias === 'Vodafone - qa1';
  });

  if (!vodafoneDevOrg || !vodafoneQaOrg) {
    console.warn('Dev mode: No se encontraron las orgs por defecto');
    return;
  }

  // Establecer las orgs seleccionadas
  selectedOrgA = vodafoneDevOrg.alias || vodafoneDevOrg.username;
  selectedOrgB = vodafoneQaOrg.alias || vodafoneQaOrg.username;

  // Validar que las orgs sean accesibles (asíncrono)
  try {
    const [orgAValidation, orgBValidation] = await Promise.all([
      fetch(`/api/orgs/validate/${encodeURIComponent(selectedOrgA)}`),
      fetch(`/api/orgs/validate/${encodeURIComponent(selectedOrgB)}`)
    ]);

    const orgAData = await orgAValidation.json();
    const orgBData = await orgBValidation.json();

    if (!orgAData.success || !orgBData.success) {
      console.warn('Dev mode: Una de las orgs no está disponible');
      return;
    }

    // Mostrar pantalla 2 (asíncrono, no bloquea)
    showScreen2();

    // Aplicar filtro de "trigger" para mostrar ApexTrigger
    // Esperar a que los metadata types estén renderizados
    // Usar un intervalo para verificar cuando los nodes estén disponibles
    const checkAndApplyFilter = () => {
      const nodes = document.querySelectorAll('.tree-node');
      if (nodes.length > 0 && metadataTypeFilter && treeView) {
        // Los nodes ya están renderizados, aplicar el filtro
        metadataTypeFilter.value = 'trigger';
        const visibleCount = treeView.filterMetadataTypes('trigger', '');
        metadataTypeFilter.blur();

        // Si solo queda un nodo visible, expandirlo automáticamente
        if (visibleCount === 1) {
          // Esperar un poco más para asegurar que el DOM está actualizado
          setTimeout(() => {
            treeView.autoExpandSingleVisibleNode();
          }, 150);
        }
      } else {
        // Aún no hay nodes, intentar de nuevo en 200ms
        setTimeout(checkAndApplyFilter, 200);
      }
    };

    // Empezar a verificar después de un pequeño delay inicial
    setTimeout(checkAndApplyFilter, 300);
  } catch (error) {
    console.error('Dev mode: Error al validar orgs:', error);
  }
}

/**
 * Pobla los desplegables de orgs
 */
function populateOrgSelects() {
  // Limpiar opciones existentes
  orgASelect.innerHTML = '<option value="">-- Selecciona una org --</option>';
  orgBSelect.innerHTML = '<option value="">-- Selecciona una org --</option>';

  orgsList.forEach(org => {
    const displayName = org.alias || org.username;

    const optionA = document.createElement('option');
    optionA.value = org.alias || org.username;
    optionA.textContent = displayName;
    orgASelect.appendChild(optionA);

    const optionB = document.createElement('option');
    optionB.value = org.alias || org.username;
    optionB.textContent = displayName;
    orgBSelect.appendChild(optionB);
  });

  // Auto-seleccionar orgs de prueba si existen
  const vodafoneDevOrg = orgsList.find(org => {
    const alias = org.alias || org.username;
    return alias === 'Vodafone - dev11pro';
  });

  const vodafoneQaOrg = orgsList.find(org => {
    const alias = org.alias || org.username;
    return alias === 'Vodafone - qa1';
  });

  if (vodafoneDevOrg) {
    const value = vodafoneDevOrg.alias || vodafoneDevOrg.username;
    orgASelect.value = value;
  }

  if (vodafoneQaOrg) {
    const value = vodafoneQaOrg.alias || vodafoneQaOrg.username;
    orgBSelect.value = value;
  }
}

/**
 * Muestra un mensaje de error
 */
function showError(message) {
  errorMessage.textContent = message;
  errorMessage.style.display = 'block';
  setTimeout(() => {
    errorMessage.style.display = 'none';
  }, 5000);
}

/**
 * Valida las orgs seleccionadas y continúa a la siguiente pantalla
 */
async function handleContinue() {
  const orgA = orgASelect.value;
  const orgB = orgBSelect.value;

  // Validar que se hayan seleccionado ambas orgs
  if (!orgA || !orgB) {
    showError('Por favor, selecciona ambas orgs');
    return;
  }

  // Validar que sean diferentes
  if (orgA === orgB) {
    showError('Las dos orgs deben ser diferentes');
    return;
  }

  selectedOrgA = orgA;
  selectedOrgB = orgB;

  // Ocultar mensajes de error
  errorMessage.style.display = 'none';

  // Mostrar indicador de carga mientras se validan las orgs
  continueBtn.disabled = true;
  const originalBtnText = continueBtn.textContent;
  continueBtn.innerHTML = '<span class="loading-spinner"></span> Validando orgs...';

  // Validar que las orgs sean accesibles (asíncrono, no bloquea UI)
  try {
    const [orgAValidation, orgBValidation] = await Promise.all([
      fetch(`/api/orgs/validate/${encodeURIComponent(orgA)}`),
      fetch(`/api/orgs/validate/${encodeURIComponent(orgB)}`)
    ]);

    const orgAData = await orgAValidation.json();
    const orgBData = await orgBValidation.json();

    // Restaurar botón
    continueBtn.disabled = false;
    continueBtn.textContent = originalBtnText;

    if (!orgAData.success || !orgBData.success) {
      showError('Una de las orgs no está disponible, puede estar expirada o no tener acceso');
      return;
    }

    // Si ambas orgs son válidas, mostrar pantalla 2 (asíncrono)
    showScreen2();
  } catch (error) {
    console.error('Error validating orgs:', error);
    // Restaurar botón en caso de error
    continueBtn.disabled = false;
    continueBtn.textContent = originalBtnText;
    showError('Error al validar las orgs. Por favor, intenta de nuevo.');
  }
}

/**
 * Muestra la pantalla 2 y carga los metadata types
 */
async function showScreen2() {
  // Ocultar pantalla 1 y mostrar pantalla 2
  screen1.style.display = 'none';
  screen2.style.display = 'block';

  // Actualizar información de las orgs
  const orgA = orgsList.find(o => (o.alias || o.username) === selectedOrgA);
  const orgB = orgsList.find(o => (o.alias || o.username) === selectedOrgB);

  // Actualizar el texto de las orgs (los iconos ya están en el HTML)
  const orgAText = orgA?.alias || orgA?.username || selectedOrgA;
  const orgBText = orgB?.alias || orgB?.username || selectedOrgB;

  // Buscar el span que contiene el texto de la org dentro de org-info-item
  const orgAInfoItem = orgAInfo.closest('.org-info-item');
  const orgBInfoItem = orgBInfo.closest('.org-info-item');

  if (orgAInfoItem) {
    // El span orgAInfo ya existe, solo actualizar su contenido
    orgAInfo.textContent = orgAText;
  }

  if (orgBInfoItem) {
    // El span orgBInfo ya existe, solo actualizar su contenido
    orgBInfo.textContent = orgBText;
  }

  // Inicializar treeview único con ambas orgs
  treeView = new TreeView('treeview', selectedOrgA, selectedOrgB);

  // Inicializar el resizer para redimensionar el treeview
  initResizer();

  // Mostrar indicador de carga mientras se cargan los metadata types
  const treeviewElement = document.getElementById('treeview');
  const filterWrapper = treeviewElement.querySelector('.filter-wrapper');
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'loading';
  loadingDiv.style.padding = '20px';
  loadingDiv.style.textAlign = 'center';
  const loadingIndicator = document.createElement('span');
  loadingIndicator.className = 'loading-spinner';
  loadingDiv.appendChild(loadingIndicator);
  const loadingText = document.createElement('span');
  loadingText.textContent = ' Cargando tipos de metadata...';
  loadingDiv.appendChild(loadingText);
  treeviewElement.innerHTML = '';
  if (filterWrapper) {
    treeviewElement.appendChild(filterWrapper);
  }
  treeviewElement.appendChild(loadingDiv);

  // Cargar metadata types de ambas orgs de forma asíncrona y compararlos
  (async () => {
    try {
      // Cargar metadata types de ambas orgs en paralelo
      const [responseA, responseB] = await Promise.all([
        fetch(`/api/metadata-types/${encodeURIComponent(selectedOrgA)}`),
        fetch(`/api/metadata-types/${encodeURIComponent(selectedOrgB)}`)
      ]);

      const dataA = await responseA.json();
      const dataB = await responseB.json();

      if (dataA.success && dataA.metadataTypes && dataB.success && dataB.metadataTypes) {
        const typesA = dataA.metadataTypes;
        const typesB = dataB.metadataTypes;

        // Comparar los tipos de metadata
        checkMetadataTypesDifference(typesA, typesB);

        // Crear un conjunto único de tipos de metadata (unión de ambos)
        // Usar un Map para evitar duplicados basándose en xmlName
        const uniqueTypesMap = new Map();

        [...typesA, ...typesB].forEach(type => {
          const key = type.xmlName || type.metadataType;
          if (key && !uniqueTypesMap.has(key)) {
            uniqueTypesMap.set(key, type);
          }
        });

        const uniqueTypes = Array.from(uniqueTypesMap.values());

        // Actualizar opciones del filtro con todos los tipos disponibles
        updateMetadataFilterOptions(uniqueTypes);

        // Verificar que treeView existe y que estamos en la screen2 antes de renderizar
        if (treeView && screen2.style.display !== 'none') {
          // Renderizar el treeview con todos los tipos únicos
          treeView.renderMetadataTypes(uniqueTypes);

          // Aplicar los filtros si ya hay términos en los inputs
          if (metadataTypeFilter || componentFilter) {
            const typeFilter = metadataTypeFilter?.value || '';
            const componentFilterText = componentFilter?.value || '';
            if (typeFilter.trim() || componentFilterText.trim()) {
              treeView.filterMetadataTypes(typeFilter, componentFilterText);
            }
          }
        }
      } else {
        const filterWrapper = treeviewElement.querySelector('.filter-wrapper');
        treeviewElement.innerHTML = '';
        if (filterWrapper) {
          treeviewElement.appendChild(filterWrapper);
        }
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = 'Error al cargar metadata types';
        treeviewElement.appendChild(errorDiv);
      }
    } catch (error) {
      console.error('Error loading metadata types:', error);
      const filterWrapper = treeviewElement.querySelector('.filter-wrapper');
      treeviewElement.innerHTML = '';
      if (filterWrapper) {
        treeviewElement.appendChild(filterWrapper);
      }
      const errorDiv = document.createElement('div');
      errorDiv.className = 'error-message';
      errorDiv.textContent = 'Error al cargar los tipos de metadata';
      treeviewElement.appendChild(errorDiv);
    }
  })();
}

/**
 * Compara los tipos de metadata entre las dos orgs y muestra un warning si hay diferencias significativas
 * @param {Array} typesA - Tipos de metadata de la org A
 * @param {Array} typesB - Tipos de metadata de la org B
 */
function checkMetadataTypesDifference(typesA, typesB) {
  // Ocultar warning por defecto
  metadataTypesWarning.style.display = 'none';
  metadataTypesWarning.textContent = '';

  const countA = typesA.length;
  const countB = typesB.length;

  // Si ambas orgs tienen el mismo número de tipos, no hay problema aparente
  if (countA === countB) {
    return;
  }

  // Calcular la diferencia porcentual
  const maxCount = Math.max(countA, countB);
  const minCount = Math.min(countA, countB);
  const difference = maxCount - minCount;
  const percentageDiff = (difference / maxCount) * 100;

  // Mostrar warning si la diferencia es mayor al 10%
  // Esto indica que probablemente hay tipos de metadata que no se están mostrando
  // debido a permisos insuficientes en una de las orgs
  if (percentageDiff > 10) {
    const orgWithMore = countA > countB ? 'Org A' : 'Org B';
    const orgWithLess = countA > countB ? 'Org B' : 'Org A';

    const warningText = `Atenció: S'ha detectat una diferència significativa en el nombre de tipus de metadata entre les orgs. ` +
      `${orgWithMore} té ${maxCount} tipus mentre que ${orgWithLess} té ${minCount} tipus ` +
      `(diferència de ${difference} tipus, ${percentageDiff.toFixed(1)}%). ` +
      `Això pot indicar que alguns tipus de metadata no s'estan mostrant a causa de permisos insuficients ` +
      `o diferències en la configuració de les orgs.`;

    metadataTypesWarning.textContent = warningText;
    metadataTypesWarning.style.display = 'flex';
  }
}

/**
 * Convierte un patrón con comodines "*" en una expresión regular
 * @param {string} pattern - Patrón con comodines (ej: "Test*", "*Service", "My*Class")
 * @param {boolean} exactMatch - Si es true, requiere coincidencia exacta (^...$), si es false, busca parcial
 * @returns {RegExp} - Expresión regular para hacer match
 */
function patternToRegex(pattern, exactMatch = false) {
  // Escapar caracteres especiales de regex excepto "*"
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');

  if (exactMatch) {
    return new RegExp(`^${escaped}$`, 'i');
  } else {
    // Para búsqueda parcial, no usar ^ y $, solo buscar que contenga el patrón
    return new RegExp(escaped, 'i');
  }
}

/**
 * Verifica si un texto coincide con alguno de los patrones (términos con comodines)
 * @param {string} text - Texto a verificar
 * @param {string} filterText - Texto del filtro con múltiples términos separados por espacios
 * @returns {boolean} - true si el texto coincide con al menos uno de los patrones
 */
function matchesFilterPattern(text, filterText) {
  if (!filterText || !filterText.trim()) return true;

  const textLower = text.toLowerCase();
  // Dividir en términos y filtrar vacíos, convertir a lowercase para case insensitive
  const terms = filterText.trim().toLowerCase().split(/\s+/).filter(term => term.length > 0);

  // Si no hay términos, mostrar todo
  if (terms.length === 0) return true;

  // Verificar si alguno de los términos coincide
  return terms.some(term => {
    // Si el término contiene "*", usar patrón de comodines con coincidencia exacta
    // Si no contiene "*", hacer búsqueda parcial (contains)
    const hasWildcard = term.includes('*');
    const regex = patternToRegex(term, hasWildcard);
    return regex.test(textLower);
  });
}

/**
 * Actualiza las opciones del filtro (datalist) con los tipos de metadata disponibles
 * @param {Array} metadataTypes - Lista de tipos de metadata
 */
function updateMetadataFilterOptions(metadataTypes) {
  metadataTypeNames = metadataTypes
    .map(type => type.xmlName || type.directoryName)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  renderMetadataTypeSuggestions(metadataTypeFilter?.value || '');
  updateClearButtonVisibility();
}

function renderMetadataTypeSuggestions(query) {
  if (!metadataTypeSuggestions || !metadataTypeFilter) return;

  // Solo mostrar sugerencias si el input tiene focus
  if (document.activeElement !== metadataTypeFilter) {
    metadataTypeSuggestions.style.display = 'none';
    return;
  }

  const filterLower = (query || '').toLowerCase();
  metadataTypeSuggestions.innerHTML = '';

  // Actualizar visibilidad del botón de limpiar
  updateClearButtonVisibility();

  // Si no hay tipos de metadata cargados, no mostrar suggestions
  if (!metadataTypeNames || metadataTypeNames.length === 0) {
    metadataTypeSuggestions.style.display = 'none';
    return;
  }

  // Filtrar usando el patrón con comodines
  const matches = metadataTypeNames
    .filter(name => matchesFilterPattern(name, query))
    .slice(0, 200);

  if (!matches.length) {
    metadataTypeSuggestions.style.display = 'none';
    return;
  }

  matches.forEach(name => {
    const option = document.createElement('div');
    option.className = 'metadata-suggestion';
    option.textContent = name;
    option.addEventListener('mousedown', (e) => {
      e.preventDefault();
      metadataTypeFilter.value = name;
      applyFilters();
    });
    metadataTypeSuggestions.appendChild(option);
  });

  metadataTypeSuggestions.style.display = 'block';
}

function updateClearButtonVisibility() {
  // Actualizar visibilidad del botón de limpiar para tipos de metadata
  if (clearTypeFilterBtn && metadataTypeFilter) {
    if (metadataTypeFilter.value.trim()) {
      clearTypeFilterBtn.classList.add('visible');
    } else {
      clearTypeFilterBtn.classList.remove('visible');
    }
  }

  // Actualizar visibilidad del botón de limpiar para componentes
  if (clearComponentFilterBtn && componentFilter) {
    if (componentFilter.value.trim()) {
      clearComponentFilterBtn.classList.add('visible');
    } else {
      clearComponentFilterBtn.classList.remove('visible');
    }
  }
}

function clearTypeFilter() {
  if (metadataTypeFilter) {
    metadataTypeFilter.value = '';
    updateClearButtonVisibility();
    applyFilters();
  }
}

function clearComponentFilter() {
  if (componentFilter) {
    componentFilter.value = '';
    updateClearButtonVisibility();
    applyFilters();
  }
}

function hideMetadataTypeSuggestions() {
  if (metadataTypeSuggestions) {
    metadataTypeSuggestions.style.display = 'none';
  }
}

function applyFilters() {
  if (treeView) {
    const typeFilter = metadataTypeFilter?.value || '';
    const componentFilterText = componentFilter?.value || '';
    treeView.filterMetadataTypes(typeFilter, componentFilterText);
  }
  hideMetadataTypeSuggestions();
  updateClearButtonVisibility();
}

/**
 * Vuelve a la pantalla 1 y limpia todo el estado
 */
function goBackToScreen1() {
  // Cerrar y limpiar el panel de diff si está abierto
  const diffPanel = document.getElementById('diffPanel');
  const diffViewer = document.getElementById('diffViewer');
  if (diffPanel && diffPanel.classList.contains('visible')) {
    // Destruir el editor ANTES de ocultar el panel
    try {
      destroyDiffEditor();
      if (diffViewer) {
        diffViewer.innerHTML = '';
      }
      diffPanel.classList.remove('visible');
    } catch (err) {
      console.error('Error destroying diff viewer:', err);
      if (diffViewer) {
        diffViewer.innerHTML = '';
      }
      diffPanel.classList.remove('visible');
    }
  }

  // Limpiar el estado
  selectedOrgA = null;
  selectedOrgB = null;
  treeView = null;

  // Limpiar los filtros
  if (metadataTypeFilter) {
    metadataTypeFilter.value = '';
  }
  if (componentFilter) {
    componentFilter.value = '';
  }
  updateClearButtonVisibility();

  // Limpiar el treeview (preservar el filter-wrapper)
  const treeviewElement = document.getElementById('treeview');
  if (treeviewElement) {
    const filterWrapper = treeviewElement.querySelector('.filter-wrapper');
    treeviewElement.innerHTML = '';
    if (filterWrapper) {
      treeviewElement.appendChild(filterWrapper);
    }
  }

  // Limpiar información de orgs mostrada en pantalla 2
  if (orgAInfo) orgAInfo.textContent = '';
  if (orgBInfo) orgBInfo.textContent = '';

  // NO resetear los selects de orgs - mantener los valores seleccionados
  // para que el usuario pueda volver fácilmente a la pantalla 2 con las mismas orgs

  // Ocultar mensajes de error
  errorMessage.style.display = 'none';

  // Mostrar pantalla 1 y ocultar pantalla 2
  screen1.style.display = 'flex';
  screen2.style.display = 'none';
}

// Event listeners
continueBtn.addEventListener('click', handleContinue);
refreshOrgsBtn.addEventListener('click', (e) => {
  e.preventDefault();
  if (!refreshOrgsBtn.classList.contains('disabled')) {
    loadOrgs(true);
  }
});
backBtn.addEventListener('click', goBackToScreen1);

// Configurar el filtro de tipos de metadata (se aplica en tiempo real mientras escribes)
if (metadataTypeFilter) {
  metadataTypeFilter.addEventListener('input', (e) => {
    renderMetadataTypeSuggestions(e.target.value);
    // Aplicar el filtro en tiempo real mientras escribes
    applyFilters();
  });

  metadataTypeFilter.addEventListener('focus', (e) => {
    renderMetadataTypeSuggestions(e.target.value);
  });

  metadataTypeFilter.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyFilters();
    } else if (e.key === 'Escape') {
      // Si estamos editando el input, limpiar el filtro con ESC
      e.preventDefault();
      clearTypeFilter();
      metadataTypeFilter.focus();
    }
  });

  metadataTypeFilter.addEventListener('blur', () => {
    // Pequeño delay para permitir clicks en las opciones
    setTimeout(hideMetadataTypeSuggestions, 150);
  });
}

// Configurar el filtro de componentes (se aplica en tiempo real mientras escribes)
if (componentFilter) {
  componentFilter.addEventListener('input', (e) => {
    // Aplicar el filtro en tiempo real mientras escribes
    applyFilters();
  });

  componentFilter.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyFilters();
    } else if (e.key === 'Escape') {
      // Si estamos editando el input, limpiar el filtro con ESC
      e.preventDefault();
      clearComponentFilter();
      componentFilter.focus();
    }
  });
}

// Configurar botón de limpiar filtro de tipos
if (clearTypeFilterBtn) {
  clearTypeFilterBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    clearTypeFilter();
    if (metadataTypeFilter) {
      metadataTypeFilter.focus();
    }
  });
}

// Configurar botón de limpiar filtro de componentes
if (clearComponentFilterBtn) {
  clearComponentFilterBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    clearComponentFilter();
    if (componentFilter) {
      componentFilter.focus();
    }
  });
}

// Configurar botón para cerrar el panel de diff
if (closeDiffBtn) {
  closeDiffBtn.addEventListener('click', () => {
    const diffPanel = document.getElementById('diffPanel');
    const diffViewer = document.getElementById('diffViewer');
    if (diffPanel) {
      // Destruir el editor de Monaco ANTES de ocultar el panel
      // Esto evita errores de "node to be removed is not a child"
      try {
        destroyDiffEditor();
        if (diffViewer) {
          diffViewer.innerHTML = '';
        }
        diffPanel.classList.remove('visible');
      } catch (err) {
        console.error('Error destroying diff viewer:', err);
        if (diffViewer) {
          diffViewer.innerHTML = '';
        }
        diffPanel.classList.remove('visible');
      }
    }
  });
}

// Configurar toggle para alternar tema del editor
const themeToggleBtn = document.getElementById('themeToggleBtn');

if (themeToggleBtn) {
  // Función para actualizar el estado del toggle según el tema
  function updateToggleState(theme) {
    if (themeToggleBtn) {
      // checked = tema claro (vs), unchecked = tema oscuro (vs-dark)
      themeToggleBtn.checked = theme === 'vs';
    }
  }

  // Cargar tema inicial y actualizar toggle
  (async () => {
    try {
      const { getCurrentTheme } = await import('./diffViewer.js');
      // Si el editor aún no está inicializado, cargar desde localStorage
      const savedTheme = localStorage.getItem('orgdiff_monaco_theme') || 'vs-dark';
      updateToggleState(savedTheme);
    } catch (error) {
      // Si no se puede cargar, usar el valor por defecto
      const savedTheme = localStorage.getItem('orgdiff_monaco_theme') || 'vs-dark';
      updateToggleState(savedTheme);
    }
  })();

  themeToggleBtn.addEventListener('change', async () => {
    try {
      const { toggleTheme } = await import('./diffViewer.js');
      const newTheme = toggleTheme();
      updateToggleState(newTheme);
    } catch (error) {
      console.error('Error toggling theme:', error);
    }
  });
}

// Inicializar orgs al iniciar (desde localStorage o servidor)
initializeOrgs();

import { TreeView } from './treeView.js';

// Constantes
const STORAGE_KEY = 'orgdiff_orgs_list';
const DEV_MODE = true; // Cambiar a false para producción

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
const metadataFilter = document.getElementById('metadataFilter');
const backBtn = document.getElementById('backBtn');
const closeDiffBtn = document.getElementById('closeDiffBtn');
const metadataTypesWarning = document.getElementById('metadataTypesWarning');

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
  refreshOrgsBtn.disabled = true;
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
      refreshOrgsBtn.disabled = false;
      orgASelect.disabled = false;
      orgBSelect.disabled = false;
    } else {
      showError('Error al cargar la lista de orgs');
      // Ocultar mensaje de carga pero mantener combos deshabilitados
      loadingMessage.style.display = 'none';
      loadingMessage.textContent = 'Cargando orgs de Salesforce...'; // Restaurar texto original
      refreshOrgsBtn.disabled = false;
      orgASelect.disabled = true;
      orgBSelect.disabled = true;
    }
  } catch (error) {
    console.error('Error loading orgs:', error);
    showError('Error al conectar con el servidor');
    // Ocultar mensaje de carga pero mantener combos deshabilitados
    loadingMessage.style.display = 'none';
    refreshOrgsBtn.disabled = false;
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
    refreshOrgsBtn.disabled = false;
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

    // Aplicar filtro de "class" para mostrar ApexClass
    // Esperar un poco para asegurar que treeView y los metadata types estén cargados
    setTimeout(() => {
      if (metadataFilter && treeView) {
        metadataFilter.value = 'class';
        treeView.filterMetadataTypes('class');
      }
    }, 500);
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

  orgAInfo.textContent = orgA?.alias || orgA?.username || selectedOrgA;
  orgBInfo.textContent = orgB?.alias || orgB?.username || selectedOrgB;

  // Inicializar treeview único con ambas orgs
  treeView = new TreeView('treeview', selectedOrgA, selectedOrgB);

  // Mostrar indicador de carga mientras se cargan los metadata types
  const treeviewElement = document.getElementById('treeview');
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

        // Renderizar el treeview con todos los tipos únicos
        treeView.renderMetadataTypes(uniqueTypes);
      } else {
        treeviewElement.innerHTML = '<div class="error-message">Error al cargar metadata types</div>';
      }
    } catch (error) {
      console.error('Error loading metadata types:', error);
      treeviewElement.innerHTML = '<div class="error-message">Error al cargar los tipos de metadata</div>';
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
 * Vuelve a la pantalla 1 y limpia todo el estado
 */
function goBackToScreen1() {
  // Cerrar y limpiar el panel de diff si está abierto
  const diffPanel = document.getElementById('diffPanel');
  const diffViewer = document.getElementById('diffViewer');
  if (diffPanel && diffPanel.classList.contains('visible')) {
    // Destruir el editor ANTES de ocultar el panel
    import('./diffViewer.js').then(({ destroyDiffViewer }) => {
      destroyDiffViewer();
      // Limpiar el contenido después de disponer el editor
      if (diffViewer) {
        diffViewer.innerHTML = '';
      }
      // Ocultar el panel pero mantener el espacio reservado
      diffPanel.classList.remove('visible');
    }).catch(err => {
      console.error('Error destroying diff viewer:', err);
      // Aun así, limpiar y ocultar pero mantener el espacio reservado
      if (diffViewer) {
        diffViewer.innerHTML = '';
      }
      diffPanel.classList.remove('visible');
    });
  }

  // Limpiar el estado
  selectedOrgA = null;
  selectedOrgB = null;
  treeView = null;

  // Limpiar el filtro
  if (metadataFilter) {
    metadataFilter.value = '';
  }

  // Limpiar el treeview
  const treeviewElement = document.getElementById('treeview');
  if (treeviewElement) {
    treeviewElement.innerHTML = '';
  }

  // Limpiar información de orgs mostrada en pantalla 2
  orgAInfo.textContent = '';
  orgBInfo.textContent = '';

  // NO resetear los selects de orgs - mantener los valores seleccionados
  // para que el usuario pueda volver fácilmente a la pantalla 2 con las mismas orgs

  // Ocultar mensajes de error
  errorMessage.style.display = 'none';

  // Mostrar pantalla 1 y ocultar pantalla 2
  screen1.style.display = 'block';
  screen2.style.display = 'none';
}

// Event listeners
continueBtn.addEventListener('click', handleContinue);
refreshOrgsBtn.addEventListener('click', () => {
  loadOrgs(true);
});
backBtn.addEventListener('click', goBackToScreen1);

// Configurar el filtro de metadata types
if (metadataFilter) {
  metadataFilter.addEventListener('input', (e) => {
    if (treeView) {
      treeView.filterMetadataTypes(e.target.value);
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
      import('./diffViewer.js').then(({ destroyDiffViewer }) => {
        destroyDiffViewer();
        // Limpiar el contenido después de disponer el editor
        if (diffViewer) {
          diffViewer.innerHTML = '';
        }
        // Limpiar el textarea de código
        const orgACodeTextarea = document.getElementById('orgACodeTextarea');
        if (orgACodeTextarea) {
          orgACodeTextarea.value = '';
        }
        // Ocultar el panel pero mantener el espacio reservado
        diffPanel.classList.remove('visible');
      }).catch(err => {
        console.error('Error destroying diff viewer:', err);
        // Aun así, ocultar el panel pero mantener el espacio reservado
        if (diffViewer) {
          diffViewer.innerHTML = '';
        }
        diffPanel.classList.remove('visible');
      });
    }
  });
}

// Inicializar orgs al iniciar (desde localStorage o servidor)
initializeOrgs();

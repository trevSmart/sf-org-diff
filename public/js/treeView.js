import { initDiffEditor, destroyDiffEditor, scrollDiffToFirstChange } from './diffManager.js';

/**
 * Módulo para gestionar el treeview de metadata types y componentes
 */

/**
 * Crea un indicador de carga animado
 * @param {string} type - Tipo de indicador: 'spinner', 'dots'
 * @param {string} text - Texto opcional a mostrar junto al indicador
 * @returns {HTMLElement} - Elemento con el indicador de carga
 */
function createLoadingIndicator(type = 'spinner', text = '') {
  const container = document.createElement('span');
  container.className = 'loading-indicator';

  let indicator;
  if (type === 'spinner') {
    indicator = document.createElement('span');
    indicator.className = 'loading-spinner';
  } else if (type === 'dots') {
    indicator = document.createElement('span');
    indicator.className = 'loading-dots';
  }

  if (indicator) {
    container.appendChild(indicator);
  }

  if (text) {
    const textSpan = document.createElement('span');
    textSpan.textContent = ` ${text}`;
    container.appendChild(textSpan);
  }

  return container;
}

export class TreeView {
  constructor(containerId, orgAliasA, orgAliasB) {
    this.container = document.getElementById(containerId);
    this.orgAliasA = orgAliasA;
    this.orgAliasB = orgAliasB;
    this.loadedComponents = new Map(); // Cache de componentes ya cargados por metadata type
    this.loadedComponentsByOrg = new Map(); // Cache de componentes separados por org
    this.expandedNodes = new Set(); // Nodos expandidos
    this.componentCounts = new Map(); // Cache de conteos de componentes por metadata type
    this.componentSymbols = new Map(); // Referencias a los símbolos para actualizarlos tras comparar
    this.bundleFilesCache = new Map(); // Cache de archivos por componente bundle
    this.currentTypeFilter = ''; // Filtro actual de tipos aplicado
    this.currentComponentFilter = ''; // Filtro actual de componentes aplicado
  }

  getBundleTypes() {
    return new Set([
      'LightningComponentBundle',
      'AuraDefinitionBundle',
      'ExperienceBundle',
      'LightningBolt',
      'LightningExperienceTheme',
      'WaveTemplateBundle',
      'AnalyticsTemplateBundle'
    ]);
  }

  isBundleType(metadataTypeName) {
    const bundles = this.getBundleTypes();
    if (bundles.has(metadataTypeName)) return true;
    return false;
  }

  /**
   * Renderiza la lista de metadata types
   * @param {Array} metadataTypes - Array de tipos de metadata
   */
  renderMetadataTypes(metadataTypes) {
    // Preservar el filter-wrapper (que contiene el input y las suggestions)
    const filterWrapper = this.container.querySelector('.filter-wrapper');

    // Limpiar solo el contenido del treeview (no el filter-wrapper)
    const treeList = this.container.querySelector('.tree-list');
    if (treeList) {
      treeList.remove();
    }

    // Si no hay tree-list, limpiar todo excepto el filter-wrapper
    if (!this.container.querySelector('.tree-list')) {
      const children = Array.from(this.container.children);
      children.forEach(child => {
        if (!child.classList.contains('filter-wrapper')) {
          child.remove();
        }
      });
    }

    if (!metadataTypes || metadataTypes.length === 0) {
      const emptyMessage = document.createElement('div');
      emptyMessage.className = 'empty-message';
      emptyMessage.textContent = 'No hay tipos de metadata disponibles';
      this.container.appendChild(emptyMessage);
      return;
    }

    // Ordenar alfabéticamente por xmlName o directoryName
    const sortedTypes = [...metadataTypes].sort((a, b) => {
      const nameA = a.xmlName || a.directoryName || '';
      const nameB = b.xmlName || b.directoryName || '';
      return nameA.localeCompare(nameB);
    });

    const ul = document.createElement('ul');
    ul.className = 'tree-list';

    sortedTypes.forEach(metadataType => {
      const li = this.createMetadataTypeNode(metadataType);
      ul.appendChild(li);
    });

    this.container.appendChild(ul);

    // Los conteos se cargarán solo cuando el usuario expanda cada nodo
    // Esto evita sobrecargar el servidor con cientos de peticiones automáticas
  }

  /**
   * Crea un nodo para un tipo de metadata
   * @param {Object} metadataType - Objeto con información del tipo de metadata
   * @returns {HTMLElement} - Elemento li del nodo
   */
  createMetadataTypeNode(metadataType) {
    const li = document.createElement('li');
    li.className = 'tree-node';
    li.dataset.metadataType = metadataType.xmlName;
    li.dataset.directoryName = metadataType.directoryName;

    const nodeContent = document.createElement('div');
    nodeContent.className = 'node-content';
    // Permitir hacer clic en todo el ancho del node-content para expandir/colapsar
    nodeContent.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleNode(li, metadataType);
    });

    const expandIcon = document.createElement('i');
    expandIcon.className = 'expand-icon fas fa-chevron-right';
    expandIcon.style.userSelect = 'none';

    const folderIcon = document.createElement('i');
    folderIcon.className = 'fas fa-folder folder-icon';
    folderIcon.style.userSelect = 'none';

    const label = document.createElement('span');
    label.className = 'node-label';
    const metadataTypeName = metadataType.xmlName || metadataType.directoryName;
    // Inicialmente no mostrar conteos, se cargarán cuando se expanda el nodo
    label.innerHTML = `<span class="node-name">${metadataTypeName}</span> <span class="node-counts" data-metadata-type="${metadataType.xmlName}" style="display: none;"></span>`;

    nodeContent.appendChild(expandIcon);
    nodeContent.appendChild(folderIcon);
    nodeContent.appendChild(label);
    li.appendChild(nodeContent);

    // Contenedor para hijos (componentes)
    const childrenContainer = document.createElement('ul');
    childrenContainer.className = 'tree-children';
    childrenContainer.style.display = 'none';
    li.appendChild(childrenContainer);

    return li;
  }

  /**
   * Expande o colapsa un nodo
   * @param {HTMLElement} node - Elemento li del nodo
   * @param {Object} metadataType - Objeto con información del tipo de metadata
   */
  async toggleNode(node, metadataType) {
    const childrenContainer = node.querySelector('.tree-children');
    const expandIcon = node.querySelector('.expand-icon');
    const metadataTypeName = metadataType.xmlName;

    if (this.expandedNodes.has(metadataTypeName)) {
      // Colapsar
      childrenContainer.style.display = 'none';
      expandIcon.className = 'expand-icon fas fa-chevron-right';
      this.expandedNodes.delete(metadataTypeName);
    } else {
      // Expandir
      expandIcon.className = 'expand-icon fas fa-chevron-down';
      this.expandedNodes.add(metadataTypeName);

      // Si el conteo no está cargado, cargarlo ahora cuando se expande el nodo
      if (!this.componentCounts.has(metadataTypeName)) {
        // Mostrar indicador de carga animado mientras se carga
        const countsElement = this.container.querySelector(
          `.node-counts[data-metadata-type="${metadataTypeName}"]`
        );
        if (countsElement) {
          countsElement.innerHTML = '';
          countsElement.style.display = 'inline';
        }
        // Cargar el conteo en segundo plano sin bloquear la expansión
        this.loadSingleComponentCount(metadataTypeName).catch(err => {
          console.error(`Error loading count for ${metadataTypeName}:`, err);
          // En caso de error, mostrar "..."
          this.updateNodeCount(metadataTypeName, '...', '...');
        });
      }

      // Si ya tenemos los componentes cargados, mostrarlos
      if (this.loadedComponents.has(metadataTypeName)) {
        this.renderComponents(childrenContainer, this.loadedComponents.get(metadataTypeName), metadataTypeName);
        childrenContainer.style.display = 'block';

        // Reaplicar los filtros si hay alguno activo
        if (this.currentTypeFilter || this.currentComponentFilter) {
          this.filterMetadataTypes(this.currentTypeFilter, this.currentComponentFilter);
        }
      } else {
        // Mostrar mensaje de carga con spinner
        const loadingLi = document.createElement('li');
        loadingLi.className = 'loading';
        const loadingIndicator = createLoadingIndicator('spinner', 'Cargando componentes');
        loadingLi.appendChild(loadingIndicator);
        childrenContainer.innerHTML = '';
        childrenContainer.appendChild(loadingLi);
        childrenContainer.style.display = 'block';

        // Hacer la carga asíncrona sin bloquear la UI
        (async () => {
          try {
            // Cargar componentes de ambas orgs en paralelo
            const [responseA, responseB] = await Promise.all([
              fetch(`/api/metadata/${this.orgAliasA}/${metadataTypeName}`),
              fetch(`/api/metadata/${this.orgAliasB}/${metadataTypeName}`)
            ]);

            const dataA = await responseA.json();
            const dataB = await responseB.json();

            if (dataA.success && dataB.success) {
              // Unir componentes sin duplicados
              const componentsA = dataA.components || [];
              const componentsB = dataB.components || [];
              const unionComponents = this.unionComponents(componentsA, componentsB);

              // Guardar también los componentes originales por org para comparación rápida
              // Esto evita tener que buscar de nuevo cuando comparamos
              const componentsByOrg = {
                orgA: componentsA,
                orgB: componentsB
              };
              this.loadedComponents.set(metadataTypeName, unionComponents);
              this.loadedComponentsByOrg = this.loadedComponentsByOrg || new Map();
              this.loadedComponentsByOrg.set(metadataTypeName, componentsByOrg);

              // Actualizar conteos en cache
              this.componentCounts.set(metadataTypeName, {
                countA: componentsA.length,
                countB: componentsB.length
              });

              // Renderizar componentes (pasar metadataTypeName para las comparaciones)
              this.renderComponents(childrenContainer, unionComponents, metadataTypeName);

              // Reaplicar los filtros si hay alguno activo
              if (this.currentTypeFilter || this.currentComponentFilter) {
                this.filterMetadataTypes(this.currentTypeFilter, this.currentComponentFilter);
              }
            } else {
              const errorLi = document.createElement('li');
              errorLi.className = 'error';
              errorLi.appendChild(this.createErrorElement('Error al cargar componentes'));
              childrenContainer.innerHTML = '';
              childrenContainer.appendChild(errorLi);
            }
          } catch (error) {
            console.error('Error loading components:', error);
            const errorLi = document.createElement('li');
            errorLi.className = 'error';
            const errorMsg = `Error al cargar componentes: ${error.message || 'Error desconocido'}`;
            errorLi.appendChild(this.createErrorElement(errorMsg));
            childrenContainer.innerHTML = '';
            childrenContainer.appendChild(errorLi);
          }
        })();
      }
    }
  }

  /**
   * Une los componentes de ambas orgs sin duplicados
   * For ApexClass and ApexTrigger, compares lengthWithoutComments to detect differences
   * @param {Array} componentsA - Componentes de la org A
   * @param {Array} componentsB - Componentes de la org B
   * @returns {Array} - Array con la unión sin duplicados
   */
  unionComponents(componentsA, componentsB) {
    const componentMap = new Map();

    // Create a map of org B components for quick lookup
    const orgBMap = new Map();
    componentsB.forEach(component => {
      const key = component.fullName || component.name || component.fileName;
      if (key) {
        orgBMap.set(key, component);
      }
    });

    // Agregar componentes de la org A
    componentsA.forEach(component => {
      const key = component.fullName || component.name || component.fileName;
      if (key) {
        const orgBComponent = orgBMap.get(key);
        const inBothOrgs = !!orgBComponent;
        
        // Check for differences using lengthWithoutComments (for ApexClass and ApexTrigger)
        let hasDifferences = false;
        if (inBothOrgs && component.lengthWithoutComments !== undefined && orgBComponent.lengthWithoutComments !== undefined) {
          hasDifferences = component.lengthWithoutComments !== orgBComponent.lengthWithoutComments;
        }

        componentMap.set(key, {
          ...component,
          inOrgA: true,
          inOrgB: inBothOrgs,
          hasDifferences,
          lengthWithoutCommentsA: component.lengthWithoutComments,
          lengthWithoutCommentsB: inBothOrgs ? orgBComponent.lengthWithoutComments : undefined
        });
      }
    });

    // Agregar componentes que solo están en org B
    componentsB.forEach(component => {
      const key = component.fullName || component.name || component.fileName;
      if (key && !componentMap.has(key)) {
        componentMap.set(key, {
          ...component,
          inOrgA: false,
          inOrgB: true,
          hasDifferences: false,
          lengthWithoutCommentsA: undefined,
          lengthWithoutCommentsB: component.lengthWithoutComments
        });
      }
    });

    // Convertir el Map a Array y ordenar por nombre
    return Array.from(componentMap.values()).sort((a, b) => {
      const nameA = a.fullName || a.name || a.fileName || '';
      const nameB = b.fullName || b.name || b.fileName || '';
      return nameA.localeCompare(nameB);
    });
  }

  /**
   * Renderiza los componentes como hijos de un nodo
   * @param {HTMLElement} container - Contenedor donde renderizar
   * @param {Array} components - Array de componentes
   * @param {string} metadataTypeName - Nombre del tipo de metadata
   */
  renderComponents(container, components, metadataTypeName) {
    container.innerHTML = '';

    if (!components || components.length === 0) {
      container.innerHTML = '<li class="empty">No hay componentes de este tipo</li>';
      return;
    }

    // OPTIMIZACIÓN: Usar los componentes originales por org si están en cache
    // Esto nos da acceso a todos los metadatos completos sin necesidad de buscar
    const componentsByOrg = this.loadedComponentsByOrg?.get(metadataTypeName);
    let componentMapA = new Map();
    let componentMapB = new Map();

    if (componentsByOrg) {
      // Usar los componentes originales que tienen todos los metadatos
      componentsByOrg.orgA.forEach(c => {
        const key = c.fullName || c.name || c.fileName;
        if (key) componentMapA.set(key, c);
      });
      componentsByOrg.orgB.forEach(c => {
        const key = c.fullName || c.name || c.fileName;
        if (key) componentMapB.set(key, c);
      });
    } else {
      // Fallback: usar los componentes unificados (menos información)
      const componentsA = components.filter(c => c.inOrgA);
      const componentsB = components.filter(c => c.inOrgB);
      componentsA.forEach(c => {
        const key = c.fullName || c.name || c.fileName;
        if (key) componentMapA.set(key, c);
      });
      componentsB.forEach(c => {
        const key = c.fullName || c.name || c.fileName;
        if (key) componentMapB.set(key, c);
      });
    }

    components.forEach(component => {
      const name = component.fullName || component.name || component.fileName;
      const isBundle = this.isBundleType(metadataTypeName);

      const li = document.createElement('li');
      li.className = isBundle ? 'tree-node bundle-node' : 'tree-leaf';
      li.dataset.componentName = name;

      // Crear contenedor para el símbolo y el nombre
      const componentContent = document.createElement('div');
      componentContent.className = 'component-content';

      // Crear símbolo según en qué orgs está y si hay diferencias detectadas
      const symbol = document.createElement('span');
      symbol.className = 'component-symbol';

      if (component.inOrgA && component.inOrgB) {
        // Component exists in both orgs - check if we detected differences via lengthWithoutComments
        if (component.hasDifferences) {
          // Differences detected via lengthWithoutComments comparison
          symbol.textContent = '!';
          symbol.className += ' symbol-both symbol-different';
          symbol.title = `Diferente entre orgs (longitud: ${component.lengthWithoutCommentsA} vs ${component.lengthWithoutCommentsB})`;
        } else if (component.lengthWithoutCommentsA !== undefined && component.lengthWithoutCommentsB !== undefined) {
          // Same lengthWithoutComments - likely equal (but click to verify)
          symbol.textContent = '=';
          symbol.className += ' symbol-both symbol-equal';
          symbol.title = 'Probablemente igual (misma longitud sin comentarios)';
        } else {
          // No lengthWithoutComments available - unknown status
          symbol.textContent = '?';
          symbol.className += ' symbol-both symbol-unknown';
          symbol.title = 'Haz clic para comparar contenido';
        }
      } else if (component.inOrgA) {
        symbol.textContent = 'A';
        symbol.className += ' symbol-org-a';
        symbol.title = 'Solo en Org A';
      } else if (component.inOrgB) {
        symbol.textContent = 'B';
        symbol.className += ' symbol-org-b';
        symbol.title = 'Solo en Org B';
      }

      // Crear span para el nombre
      const nameSpan = document.createElement('span');
      nameSpan.className = 'component-name';
      nameSpan.textContent = name;

      // Guardar referencia del símbolo para actualizarlo tras comparar
      const componentKey = this.getComponentKey(metadataTypeName, name);
      this.componentSymbols.set(componentKey, symbol);

      if (isBundle) {
        // Bundle: mostrar caret y permitir expandir archivos
        const expandIcon = document.createElement('span');
        expandIcon.className = 'expand-icon';
        expandIcon.textContent = '▶';
        expandIcon.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleBundleComponent(li, metadataTypeName, name);
        });
        componentContent.prepend(expandIcon);
        componentContent.classList.add('bundle-header');
      }

      componentContent.appendChild(symbol);
      componentContent.appendChild(nameSpan);
      li.appendChild(componentContent);

      if (isBundle) {
        const childrenContainer = document.createElement('ul');
        childrenContainer.className = 'tree-children bundle-files';
        childrenContainer.style.display = 'none';
        li.appendChild(childrenContainer);
        li.addEventListener('click', (e) => {
          // Evitar que hacer clic en el li cause acciones extra si ya se hace en expandIcon
          if (e.target === li || e.target === componentContent || e.target === nameSpan) {
            this.toggleBundleComponent(li, metadataTypeName, name);
          }
        });
      } else {
        // Si el componente está en ambas orgs, hacer clickeable para ver el diff
        if (component.inOrgA && component.inOrgB) {
          li.style.cursor = 'pointer';
          li.addEventListener('click', () => {
            this.openDiffViewer(component, metadataTypeName);
          });
        }
      }

      container.appendChild(li);
    });
  }

  // NOTA: Las funciones de comparación automática (queueComparison, processComparisonQueue,
  // quickCompareComponents, compareComponent) han sido eliminadas porque la comparación
  // por metadatos no es fiable. Una clase puede crearse en un org y desplegarse
  // meses después a otro org, teniendo fechas diferentes pero contenido idéntico.
  // Por lo tanto, solo comparamos el contenido real cuando el usuario hace clic para ver el diff.

  /**
   * Compara un componente entre ambas orgs de forma asíncrona y actualiza el símbolo
   * Solo se usa cuando no tenemos los metadatos completos en cache
   * @param {Object} component - Componente a comparar
   * @param {string} metadataTypeName - Nombre del tipo de metadata
   * @param {HTMLElement} symbolElement - Elemento del símbolo a actualizar
   */
  async compareComponent(component, metadataTypeName, symbolElement) {
    const componentName = component.fullName || component.name || component.fileName;

    try {
      const response = await fetch(
        `/api/compare/${encodeURIComponent(this.orgAliasA)}/${encodeURIComponent(this.orgAliasB)}/${encodeURIComponent(metadataTypeName)}/${encodeURIComponent(componentName)}`
      );

      const data = await response.json();

      if (data.success) {
        // Actualizar el símbolo según el resultado de la comparación
        if (data.areEqual) {
          symbolElement.textContent = '✓';
          symbolElement.className = 'component-symbol symbol-both symbol-equal';
          symbolElement.title = 'Igual en ambas orgs';
        } else {
          symbolElement.textContent = '!';
          symbolElement.className = 'component-symbol symbol-both symbol-different';
          symbolElement.title = 'Diferente entre orgs';
        }
      } else {
        // Si hay error, mostrar error
        symbolElement.textContent = '?';
        symbolElement.className = 'component-symbol symbol-both symbol-error';
        symbolElement.title = `Error al comparar: ${data.error || 'Error desconocido'}`;
      }
    } catch (error) {
      console.error(`Error comparing component ${componentName}:`, error);
      symbolElement.textContent = '?';
      symbolElement.className = 'component-symbol symbol-both symbol-error';
      symbolElement.title = 'Error al comparar';
    }
  }

  /**
   * Crea un elemento de error con botón para copiar al portapapeles
   * @param {string} errorMessage - Mensaje de error
   * @returns {HTMLElement} - Elemento div con el error y botón de copiar
   */
  createErrorElement(errorMessage) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error';

    const errorText = document.createElement('span');
    errorText.textContent = errorMessage;
    errorDiv.appendChild(errorText);

    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-error-btn';
    copyBtn.innerHTML = '📋 Copiar';
    copyBtn.title = 'Copiar error al portapapeles';
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(errorMessage);
        copyBtn.innerHTML = '✓ Copiado';
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.innerHTML = '📋 Copiar';
          copyBtn.classList.remove('copied');
        }, 2000);
      } catch (err) {
        console.error('Error copying to clipboard:', err);
        // Fallback para navegadores que no soportan clipboard API
        const textArea = document.createElement('textarea');
        textArea.value = errorMessage;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand('copy');
          copyBtn.innerHTML = '✓ Copiado';
          copyBtn.classList.add('copied');
          setTimeout(() => {
            copyBtn.innerHTML = '📋 Copiar';
            copyBtn.classList.remove('copied');
          }, 2000);
        } catch (e) {
          console.error('Fallback copy failed:', e);
        }
        document.body.removeChild(textArea);
      }
    });

    errorDiv.appendChild(copyBtn);
    return errorDiv;
  }

  /**
   * Abre el panel de diff viewer para un componente
   * @param {Object} component - Componente a comparar
   * @param {string} metadataTypeName - Nombre del tipo de metadata
   */
  async openDiffViewer(component, metadataTypeName, filePath = null) {
    const componentName = component.fullName || component.name || component.fileName;

    // Mostrar el panel
    const diffPanel = document.getElementById('diffPanel');
    const diffPanelTitle = document.getElementById('diffPanelTitle');
    const diffViewer = document.getElementById('diffViewer');

    if (!diffPanel || !diffPanelTitle || !diffViewer) {
      console.error('Diff panel elements not found');
      return;
    }

    // Mostrar el panel - siempre está en el layout, solo cambiamos la visibilidad
    diffPanel.classList.add('visible');

    // Crear icona basada en el component
    const symbol = document.createElement('span');
    symbol.className = 'component-symbol';

    if (component.inOrgA && component.inOrgB) {
      // Si està a ambdues orgs, mostrar icona "?" (desconegut) o la icona actualitzada
      // Primer comprovem si ja tenim l'estat del símbol guardat
      const componentKey = this.getComponentKey(metadataTypeName, componentName);
      const existingSymbol = this.componentSymbols.get(componentKey);

      if (existingSymbol) {
        // Copiar les classes de l'icona existent
        symbol.className = existingSymbol.className;
        symbol.textContent = existingSymbol.textContent;
      } else {
        symbol.textContent = '?';
        symbol.className += ' symbol-both symbol-unknown';
      }
    } else if (component.inOrgA) {
      symbol.textContent = 'A';
      symbol.className += ' symbol-org-a';
    } else if (component.inOrgB) {
      symbol.textContent = 'B';
      symbol.className += ' symbol-org-b';
    }

    // Netejar el títol i afegir la icona
    diffPanelTitle.innerHTML = '';
    diffPanelTitle.appendChild(symbol);

    // Crear elements separats per al tipus de metadata i el nom del component
    const metadataTypeSpan = document.createElement('span');
    metadataTypeSpan.className = 'diff-title-metadata-type';
    metadataTypeSpan.textContent = metadataTypeName;

    const separatorSpan = document.createTextNode(': ');

    const componentNameSpan = document.createElement('span');
    componentNameSpan.className = 'diff-title-component-name';
    componentNameSpan.textContent = componentName;

    diffPanelTitle.appendChild(document.createTextNode(' '));
    diffPanelTitle.appendChild(metadataTypeSpan);
    diffPanelTitle.appendChild(separatorSpan);
    diffPanelTitle.appendChild(componentNameSpan);

    // Si hi ha filePath, afegir-lo també
    if (filePath) {
      const filePathSpan = document.createElement('span');
      filePathSpan.className = 'diff-title-file-path';
      filePathSpan.textContent = ' / ' + filePath;
      diffPanelTitle.appendChild(filePathSpan);
    }

    // Actualizar etiquetas de las orgs (mantener las icones A y B)
    const diffLabelA = document.getElementById('diffLabelA');
    const diffLabelB = document.getElementById('diffLabelB');
    const labelTextA = diffLabelA?.querySelector('.diff-label-text');
    const labelTextB = diffLabelB?.querySelector('.diff-label-text');
    if (labelTextA) labelTextA.textContent = `${this.orgAliasA}`;
    if (labelTextB) labelTextB.textContent = `${this.orgAliasB}`;

    // Asegurar altura visible para el contenedor del diff
    if (diffViewer) {
      diffViewer.style.minHeight = '420px';
      diffViewer.style.height = '420px';
    }

    // Destruir el editor anterior si existe antes de limpiar el container
    // Esto evita errores de "node to be removed is not a child"
    try {
      destroyDiffEditor();
    } catch (err) {
      console.warn('Error destroying previous diff viewer:', err);
    }

    // Mostrar indicador de carga animado
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'loading';
    const loadingIndicator = createLoadingIndicator('spinner', 'Cargando contenido');
    loadingDiv.appendChild(loadingIndicator);
    diffViewer.innerHTML = '';
    diffViewer.appendChild(loadingDiv);


    // Hacer la carga asíncrona sin bloquear la UI
    try {
      // Obtener contenido de ambas orgs en paralelo (peticiones y parsing JSON)
      const [dataA, dataB] = await Promise.all([
        fetch(`/api/component-content/${encodeURIComponent(this.orgAliasA)}/${encodeURIComponent(metadataTypeName)}/${encodeURIComponent(componentName)}${filePath ? `?file=${encodeURIComponent(filePath)}` : ''}`).then(res => res.json()),
        fetch(`/api/component-content/${encodeURIComponent(this.orgAliasB)}/${encodeURIComponent(metadataTypeName)}/${encodeURIComponent(componentName)}${filePath ? `?file=${encodeURIComponent(filePath)}` : ''}`).then(res => res.json())
      ]);

      if (dataA.success && dataB.success) {
        // Determinar el lenguaje según el tipo de metadata
        const language = this.getLanguageForMetadataType(metadataTypeName);

        // Esperar a que el panel esté completamente visible y tenga dimensiones
        // Usar requestAnimationFrame para asegurar que el layout se haya actualizado
        await new Promise(resolve => requestAnimationFrame(resolve));
        await new Promise(resolve => setTimeout(resolve, 100));

        // Verificar que el panel tiene dimensiones antes de inicializar el editor
        const panelRect = diffPanel.getBoundingClientRect();
        if (panelRect.width === 0 || panelRect.height === 0) {
          // Si aún no tiene dimensiones, esperar un poco más
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Mostrar contenido: Org A a la izquierda, Org B a la derecha
        await initDiffEditor('diffViewer', dataA.content, dataB.content, language);

        // Actualizar toggle del tema después de inicializar el editor
        const themeToggleBtn = document.getElementById('themeToggleBtn');
        if (themeToggleBtn) {
          // Solo aplicable a Monaco; per altres editors, mantenim l'estat actual
          try {
            const { getCurrentTheme } = await import('./diffViewer.js');
            const currentTheme = getCurrentTheme();
            themeToggleBtn.checked = currentTheme === 'vs';
          } catch (_err) {
            // ignore
          }
        }

        // Actualizar símbolo según igualdad/diferencia del contenido
        const areEqual = dataA.content === dataB.content;
        this.updateComponentSymbol(metadataTypeName, componentName, areEqual ? 'equal' : 'different');

        // Actualizar la icona del títol amb el símbol correcte
        this.updateTitleSymbol(diffPanelTitle, metadataTypeName, componentName, areEqual);

        // Si hay diferencias, hacer scroll automático a la primera diferencia
        if (!areEqual) {
          // Esperar un poco para asegurar que el editor está completamente renderizado
          setTimeout(() => {
            try {
              scrollDiffToFirstChange();
            } catch (err) {
              console.warn('Error scrolling diff:', err);
            }
          }, 200);
        }
      } else {
        const errorMsg = dataA.error || dataB.error || 'Error desconocido';
        const fullErrorMsg = `Error al cargar el contenido: ${errorMsg}`;
        diffViewer.innerHTML = '';
        diffViewer.appendChild(this.createErrorElement(fullErrorMsg));
        this.updateComponentSymbol(metadataTypeName, componentName, 'error');
      }
    } catch (error) {
      console.error('Error opening diff viewer:', error);
      const fullErrorMsg = `Error al abrir el visor de diferencias: ${error.message}`;
      diffViewer.innerHTML = '';
      diffViewer.appendChild(this.createErrorElement(fullErrorMsg));
      this.updateComponentSymbol(metadataTypeName, componentName, 'error');
    }
  }

  getComponentKey(metadataTypeName, componentName) {
    return `${metadataTypeName}::${componentName}`;
  }

  async toggleBundleComponent(node, metadataTypeName, componentName) {
    const expandIcon = node.querySelector('.expand-icon');
    const childrenContainer = node.querySelector('.bundle-files');
    if (!childrenContainer || !expandIcon) return;

    const isOpen = childrenContainer.style.display === 'block';

    if (isOpen) {
      childrenContainer.style.display = 'none';
      expandIcon.textContent = '▶';
      return;
    }

    expandIcon.textContent = '▼';
    childrenContainer.innerHTML = '';

    // Mostrar loading
    const loadingLi = document.createElement('li');
    loadingLi.className = 'loading';
    loadingLi.textContent = 'Cargando archivos...';
    childrenContainer.appendChild(loadingLi);
    childrenContainer.style.display = 'block';

    try {
      const filesData = await this.loadBundleFiles(metadataTypeName, componentName);
      this.renderBundleFiles(childrenContainer, filesData, metadataTypeName, componentName);

      // Reaplicar los filtros si hay alguno activo
      if (this.currentTypeFilter || this.currentComponentFilter) {
        this.filterMetadataTypes(this.currentTypeFilter, this.currentComponentFilter);
      }
    } catch (error) {
      console.error('Error loading bundle files:', error);
      childrenContainer.innerHTML = '';
      const errorLi = document.createElement('li');
      errorLi.className = 'error';
      errorLi.textContent = 'Error carregant els fitxers del bundle';
      childrenContainer.appendChild(errorLi);
    }
  }

  async loadBundleFiles(metadataTypeName, componentName) {
    const key = this.getComponentKey(metadataTypeName, componentName);
    if (this.bundleFilesCache.has(key)) {
      return this.bundleFilesCache.get(key);
    }

    const [respA, respB] = await Promise.all([
      fetch(`/api/bundle-files/${encodeURIComponent(this.orgAliasA)}/${encodeURIComponent(metadataTypeName)}/${encodeURIComponent(componentName)}`),
      fetch(`/api/bundle-files/${encodeURIComponent(this.orgAliasB)}/${encodeURIComponent(metadataTypeName)}/${encodeURIComponent(componentName)}`)
    ]);

    const dataA = await respA.json();
    const dataB = await respB.json();

    if (!dataA.success || !dataB.success) {
      throw new Error(dataA.error || dataB.error || 'Error carregant fitxers');
    }

    const filesA = dataA.files || [];
    const filesB = dataB.files || [];
    const unionMap = new Map();

    filesA.forEach(f => {
      unionMap.set(f, { path: f, inOrgA: true, inOrgB: false });
    });
    filesB.forEach(f => {
      if (unionMap.has(f)) {
        unionMap.set(f, { ...unionMap.get(f), inOrgB: true });
      } else {
        unionMap.set(f, { path: f, inOrgA: false, inOrgB: true });
      }
    });

    const unionFiles = Array.from(unionMap.values()).sort((a, b) => a.path.localeCompare(b.path));
    const result = { filesA, filesB, unionFiles };
    this.bundleFilesCache.set(key, result);
    return result;
  }

  renderBundleFiles(container, filesData, metadataTypeName, componentName) {
    container.innerHTML = '';
    if (!filesData.unionFiles.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'No s\'han trobat fitxers';
      container.appendChild(li);
      return;
    }

    filesData.unionFiles.forEach(file => {
      const li = document.createElement('li');
      li.className = 'tree-leaf bundle-file';

      const content = document.createElement('div');
      content.className = 'component-content';

      const symbol = document.createElement('span');
      symbol.className = 'component-symbol';
      if (file.inOrgA && file.inOrgB) {
        symbol.textContent = '⇄';
        symbol.classList.add('symbol-both');
        symbol.title = 'Fitxer a ambdues orgs';
      } else if (file.inOrgA) {
        symbol.textContent = 'A';
        symbol.classList.add('symbol-org-a');
        symbol.title = 'Només a Org A';
      } else if (file.inOrgB) {
        symbol.textContent = 'B';
        symbol.classList.add('symbol-org-b');
        symbol.title = 'Només a Org B';
      }

      const nameSpan = document.createElement('span');
      nameSpan.className = 'component-name';
      nameSpan.textContent = file.path;

      content.appendChild(symbol);
      content.appendChild(nameSpan);
      li.appendChild(content);

      if (file.inOrgA && file.inOrgB) {
        li.style.cursor = 'pointer';
        li.addEventListener('click', () => {
          this.openDiffViewer({
            fullName: componentName,
            inOrgA: true,
            inOrgB: true
          }, metadataTypeName, file.path);
        });
      }

      container.appendChild(li);
    });
  }

  updateComponentSymbol(metadataTypeName, componentName, status) {
    const key = this.getComponentKey(metadataTypeName, componentName);
    const symbol = this.componentSymbols.get(key);
    if (!symbol) return;

    symbol.className = 'component-symbol symbol-both';

    if (status === 'equal') {
      symbol.textContent = '=';
      symbol.classList.add('symbol-equal');
      symbol.title = 'Igual en ambas orgs';
    } else if (status === 'different') {
      symbol.textContent = '!';
      symbol.classList.add('symbol-different');
      symbol.title = 'Diferente entre orgs';
    } else if (status === 'error') {
      symbol.textContent = '?';
      symbol.classList.add('symbol-error');
      symbol.title = 'Error al comparar';
    } else {
      symbol.textContent = '?';
      symbol.classList.add('symbol-unknown');
      symbol.title = 'Haz clic para comparar contenido';
    }
  }

  /**
   * Actualiza la icona del títol del diff panel quan se detectan diferencias
   * @param {HTMLElement} titleElement - Elemento del título
   * @param {string} metadataTypeName - Nombre del tipo de metadata
   * @param {string} componentName - Nombre del componente
   * @param {boolean} areEqual - Si el contenido es igual o diferente
   */
  updateTitleSymbol(titleElement, metadataTypeName, componentName, areEqual) {
    if (!titleElement) return;

    // Buscar el símbol actual en el títol
    const existingSymbol = titleElement.querySelector('.component-symbol');
    if (!existingSymbol) return;

    // Actualizar el símbol según si son iguales o diferentes
    existingSymbol.className = 'component-symbol symbol-both';

    if (areEqual) {
      existingSymbol.textContent = '=';
      existingSymbol.classList.add('symbol-equal');
      existingSymbol.title = 'Igual en ambas orgs';
    } else {
      existingSymbol.textContent = '!';
      existingSymbol.classList.add('symbol-different');
      existingSymbol.title = 'Diferente entre orgs';
    }
  }

  /**
   * Determina el lenguaje para Monaco Editor según el tipo de metadata
   * @param {string} metadataType - Tipo de metadata
   * @returns {string} - Lenguaje para syntax highlighting
   */
  getLanguageForMetadataType(metadataType) {
    const languageMap = {
      'ApexClass': 'apex',
      'ApexTrigger': 'apex',
      'ApexPage': 'html',
      'ApexComponent': 'html',
      'LightningComponentBundle': 'javascript',
      'AuraDefinitionBundle': 'javascript'
    };

    return languageMap[metadataType] || 'xml';
  }

  /**
   * Carga los conteos de componentes para todos los metadata types
   * @param {Array} metadataTypes - Array de tipos de metadata
   */
  async loadComponentCounts(metadataTypes) {
    // Cargar conteos en lotes para no sobrecargar el servidor
    // Reducir significativamente la concurrencia para evitar sobrecargar el servidor
    const batchSize = 2; // Reducido a 2 para evitar sobrecarga del servidor
    const delayBetweenBatches = 500; // 500ms de delay entre lotes para dar tiempo al servidor
    const maxTypesToLoad = 50; // Limitar a los primeros 50 tipos para evitar sobrecarga

    // Limitar el número de tipos a cargar para evitar sobrecargar el servidor
    const typesToLoad = metadataTypes.slice(0, maxTypesToLoad);

    for (let i = 0; i < typesToLoad.length; i += batchSize) {
      const batch = typesToLoad.slice(i, i + batchSize);

      // Cargar conteos en paralelo para este lote
      const countPromises = batch.map(async (metadataType) => {
        const metadataTypeName = metadataType.xmlName;

        // Si ya tenemos el conteo en cache, usarlo
        if (this.componentCounts.has(metadataTypeName)) {
          return { metadataTypeName, counts: this.componentCounts.get(metadataTypeName) };
        }

        try {
          // Cargar componentes de ambas orgs en paralelo
          const [responseA, responseB] = await Promise.all([
            fetch(`/api/metadata/${encodeURIComponent(this.orgAliasA)}/${encodeURIComponent(metadataTypeName)}`),
            fetch(`/api/metadata/${encodeURIComponent(this.orgAliasB)}/${encodeURIComponent(metadataTypeName)}`)
          ]);

          // Parsear respuestas JSON (incluso si hay errores HTTP, el servidor devuelve JSON)
          let dataA, dataB;
          try {
            dataA = await responseA.json();
          } catch (e) {
            console.error(`Error parsing response A for ${metadataTypeName}:`, e);
            dataA = { success: false, error: 'Failed to parse response' };
          }

          try {
            dataB = await responseB.json();
          } catch (e) {
            console.error(`Error parsing response B for ${metadataTypeName}:`, e);
            dataB = { success: false, error: 'Failed to parse response' };
          }

          // Si alguna respuesta no fue exitosa, manejar el error
          if (!dataA.success || !dataB.success) {
            const errorMsg = dataA.error || dataB.error || 'Unknown error';
            console.warn(`Failed to load component count for ${metadataTypeName}: ${errorMsg}`);
            // No establecer conteos, dejar que se muestre "..." o se intente de nuevo
            return { metadataTypeName, counts: null };
          }

          const countA = (dataA.components || []).length;
          const countB = (dataB.components || []).length;

          const counts = { countA, countB };
          this.componentCounts.set(metadataTypeName, counts);

          return { metadataTypeName, counts };
        } catch (error) {
          console.error(`Error loading component count for ${metadataTypeName}:`, error);
          // No establecer conteos en 0 si hay error, dejar que se intente de nuevo más tarde
          return { metadataTypeName, counts: null };
        }
      });

      const results = await Promise.all(countPromises);

      // Actualizar la UI con los conteos (solo si tenemos conteos válidos)
      results.forEach(({ metadataTypeName, counts }) => {
        if (counts) {
          this.updateNodeCount(metadataTypeName, counts.countA, counts.countB);
        } else {
          // Mostrar "..." mientras se carga o hay error
          this.updateNodeCount(metadataTypeName, '...', '...');
        }
      });

      // Esperar un poco antes de procesar el siguiente lote
      if (i + batchSize < typesToLoad.length) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }

    // Si hay más tipos de los que se cargaron, marcar los restantes como "cargar bajo demanda"
    if (metadataTypes.length > maxTypesToLoad) {
      for (let i = maxTypesToLoad; i < metadataTypes.length; i++) {
        const metadataTypeName = metadataTypes[i].xmlName;
        // Los tipos restantes se cargarán cuando el usuario expanda el nodo
        // Por ahora, mostrar "..." para indicar que no se ha cargado aún
        this.updateNodeCount(metadataTypeName, '...', '...');
      }
    }
  }

  /**
   * Carga el conteo de componentes para un único tipo de metadata
   * @param {string} metadataTypeName - Nombre del tipo de metadata
   */
  async loadSingleComponentCount(metadataTypeName) {
    try {
      // Cargar componentes de ambas orgs en paralelo
      const [responseA, responseB] = await Promise.all([
        fetch(`/api/metadata/${encodeURIComponent(this.orgAliasA)}/${encodeURIComponent(metadataTypeName)}`),
        fetch(`/api/metadata/${encodeURIComponent(this.orgAliasB)}/${encodeURIComponent(metadataTypeName)}`)
      ]);

      // Parsear respuestas JSON
      let dataA, dataB;
      try {
        dataA = await responseA.json();
      } catch (e) {
        console.error(`Error parsing response A for ${metadataTypeName}:`, e);
        dataA = { success: false, error: 'Failed to parse response' };
      }

      try {
        dataB = await responseB.json();
      } catch (e) {
        console.error(`Error parsing response B for ${metadataTypeName}:`, e);
        dataB = { success: false, error: 'Failed to parse response' };
      }

      if (dataA.success && dataB.success) {
        const countA = (dataA.components || []).length;
        const countB = (dataB.components || []).length;
        const counts = { countA, countB };
        this.componentCounts.set(metadataTypeName, counts);
        this.updateNodeCount(metadataTypeName, countA, countB);
      } else {
        // Si hay error, mostrar "..."
        this.updateNodeCount(metadataTypeName, '...', '...');
      }
    } catch (error) {
      console.error(`Error loading component count for ${metadataTypeName}:`, error);
      this.updateNodeCount(metadataTypeName, '...', '...');
    }
  }

  /**
   * Actualiza el conteo de componentes en un nodo
   * @param {string} metadataTypeName - Nombre del tipo de metadata
   * @param {number|string} countA - Número de componentes en la org A o "..." si está cargando
   * @param {number|string} countB - Número de componentes en la org B o "..." si está cargando
   */
  updateNodeCount(metadataTypeName, countA, countB) {
    const countsElement = this.container.querySelector(
      `.node-counts[data-metadata-type="${metadataTypeName}"]`
    );

    if (!countsElement) return;

    // Convertir a números si són strings o altres valors
    const numA = typeof countA === 'number' ? countA : (countA === '...' ? -1 : parseInt(countA) || 0);
    const numB = typeof countB === 'number' ? countB : (countB === '...' ? -1 : parseInt(countB) || 0);

    // Si ambdós comptadors són 0, no mostrar el recompte i aplicar estil gris clar
    if (numA === 0 && numB === 0) {
      countsElement.style.display = 'none';
      // Aplicar classe per fer el nom més gris clar
      const nodeElement = countsElement.closest('.tree-node');
      if (nodeElement) {
        const nodeName = nodeElement.querySelector('.node-name');
        if (nodeName) {
          nodeName.classList.add('node-empty');
        }
      }
    } else {
      // Si hi ha ítems o està carregant, mostrar el recompte en format "0 / 3" amb colors
      countsElement.innerHTML = '';

      const countASpan = document.createElement('span');
      countASpan.className = 'count-org-a';
      countASpan.textContent = countA;

      const separator = document.createTextNode(' / ');

      const countBSpan = document.createElement('span');
      countBSpan.className = 'count-org-b';
      countBSpan.textContent = countB;

      countsElement.appendChild(countASpan);
      countsElement.appendChild(separator);
      countsElement.appendChild(countBSpan);

      countsElement.style.display = 'inline';
      const nodeElement = countsElement.closest('.tree-node');
      if (nodeElement) {
        const nodeName = nodeElement.querySelector('.node-name');
        if (nodeName) {
          nodeName.classList.remove('node-empty');
        }
      }
    }
  }

  /**
   * Convierte un patrón con comodines "*" en una expresión regular
   * @param {string} pattern - Patrón con comodines (ej: "Test*", "*Service", "My*Class")
   * @param {boolean} exactMatch - Si es true, requiere coincidencia exacta (^...$), si es false, busca parcial
   * @returns {RegExp} - Expresión regular para hacer match
   */
  patternToRegex(pattern, exactMatch = false) {
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
  matchesFilterPattern(text, filterText) {
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
      const regex = this.patternToRegex(term, hasWildcard);
      return regex.test(textLower);
    });
  }

  /**
   * Filtra los nodos de metadata types y sus componentes según los filtros de búsqueda
   * Soporta múltiples términos separados por espacios y comodines "*"
   * @param {string} typeFilterText - Texto para filtrar tipos de metadata (puede contener múltiples términos y comodines)
   * @param {string} componentFilterText - Texto para filtrar componentes (puede contener múltiples términos y comodines)
   * @returns {number} - Número de nodos visibles después del filtro
   */
  filterMetadataTypes(typeFilterText = '', componentFilterText = '') {
    // Guardar los filtros actuales para reaplicarlos cuando se carguen nuevos componentes
    this.currentTypeFilter = typeFilterText || '';
    this.currentComponentFilter = componentFilterText || '';

    const typeFilter = (typeFilterText || '').trim();
    const componentFilter = (componentFilterText || '').trim();
    const allNodes = this.container.querySelectorAll('.tree-node[data-metadata-type]');

    // Si no hay filtros, mostrar todos los nodos y componentes
    if (!typeFilter && !componentFilter) {
      allNodes.forEach(node => {
        node.style.display = '';
        // Mostrar todos los componentes
        const childrenContainer = node.querySelector('.tree-children');
        if (childrenContainer) {
          const components = childrenContainer.querySelectorAll('.tree-leaf, .bundle-node');
          components.forEach(component => {
            component.style.display = '';
            // También mostrar todos los bundle files
            const bundleFiles = component.querySelectorAll('.bundle-file');
            bundleFiles.forEach(bundleFile => {
              bundleFile.style.display = '';
            });
          });
        }
      });
      return allNodes.length;
    }

    // Filtrar nodos de tipos de metadata y sus componentes
    let visibleCount = 0;
    allNodes.forEach(node => {
      const nodeName = node.querySelector('.node-name');
      const nodeText = nodeName ? nodeName.textContent : '';
      const childrenContainer = node.querySelector('.tree-children');

      // Verificar si el tipo de metadata coincide con el filtro de tipos
      const typeMatches = this.matchesFilterPattern(nodeText, typeFilter);

      // Filtrar componentes dentro de este tipo
      let hasVisibleComponents = false;
      if (childrenContainer) {
        const components = childrenContainer.querySelectorAll('.tree-leaf, .bundle-node');
        components.forEach(component => {
          const componentName = component.querySelector('.component-name');
          const componentText = componentName ? componentName.textContent : '';

          // Verificar si el componente coincide con el filtro de componentes
          const componentMatches = this.matchesFilterPattern(componentText, componentFilter);

          // También verificar bundle files si es un bundle component
          let bundleFilesMatch = false;
          if (component.classList.contains('bundle-node')) {
            const bundleFiles = component.querySelectorAll('.bundle-file');
            bundleFiles.forEach(bundleFile => {
              const bundleFileName = bundleFile.querySelector('.component-name');
              const bundleFileText = bundleFileName ? bundleFileName.textContent : '';
              if (this.matchesFilterPattern(bundleFileText, componentFilter)) {
                bundleFilesMatch = true;
                bundleFile.style.display = '';
              } else {
                bundleFile.style.display = 'none';
              }
            });
          }

          // Mostrar componente si coincide con el filtro de componentes
          // O si no hay filtro de componentes pero sí hay filtro de tipos (y el tipo coincide)
          if (componentFilter) {
            if (componentMatches || bundleFilesMatch) {
              component.style.display = '';
              hasVisibleComponents = true;
            } else {
              component.style.display = 'none';
            }
          } else {
            // Si no hay filtro de componentes, mostrar todos los componentes
            component.style.display = '';
            if (componentMatches || bundleFilesMatch) {
              hasVisibleComponents = true;
            }
          }
        });
      }

      // Mostrar el tipo de metadata si:
      // 1. El tipo coincide con el filtro de tipos (si hay filtro de tipos), Y
      // 2. (No hay filtro de componentes O algún componente coincide con el filtro de componentes)
      const shouldShowType = typeFilter ? typeMatches : true;
      const shouldShowComponents = componentFilter ? hasVisibleComponents : true;

      if (shouldShowType && shouldShowComponents) {
        node.style.display = '';
        visibleCount++;
      } else {
        node.style.display = 'none';
      }
    });

    return visibleCount;
  }

  /**
   * Expande automáticamente el único nodo visible si solo hay uno
   */
  autoExpandSingleVisibleNode() {
    const allNodes = this.container.querySelectorAll('.tree-node');
    const visibleNodes = Array.from(allNodes).filter(
      node => {
        const style = window.getComputedStyle(node);
        return style.display !== 'none' && style.visibility !== 'hidden';
      }
    );

    if (visibleNodes.length === 1) {
      const node = visibleNodes[0];
      const metadataTypeName = node.dataset.metadataType;

      if (metadataTypeName && !this.expandedNodes.has(metadataTypeName)) {
        // Crear objeto metadataType con la información necesaria
        const metadataType = {
          xmlName: metadataTypeName,
          directoryName: node.dataset.directoryName
        };

        // Expandir el nodo automáticamente
        this.toggleNode(node, metadataType).catch(err => {
          console.warn('Error expanding node automatically:', err);
        });
      }
    }
  }
}

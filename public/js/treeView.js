/**
 * Módulo para gestionar el treeview de metadata types y componentes
 */

/**
 * Crea un indicador de carga animado
 * @param {string} type - Tipo de indicador: 'spinner', 'dots', 'pulse'
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
  } else if (type === 'pulse') {
    indicator = document.createElement('span');
    indicator.className = 'loading-pulse';
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
  }

  /**
   * Renderiza la lista de metadata types
   * @param {Array} metadataTypes - Array de tipos de metadata
   */
  renderMetadataTypes(metadataTypes) {
    this.container.innerHTML = '';

    if (!metadataTypes || metadataTypes.length === 0) {
      this.container.innerHTML = '<div class="empty-message">No hay tipos de metadata disponibles</div>';
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

    const expandIcon = document.createElement('span');
    expandIcon.className = 'expand-icon';
    expandIcon.textContent = '▶';
    expandIcon.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleNode(li, metadataType);
    });

    const label = document.createElement('span');
    label.className = 'node-label';
    const metadataTypeName = metadataType.xmlName || metadataType.directoryName;
    // Inicialmente no mostrar conteos, se cargarán cuando se expanda el nodo
    label.innerHTML = `<span class="node-name">${metadataTypeName}</span> <span class="node-counts" data-metadata-type="${metadataType.xmlName}" style="display: none;"></span>`;
    // Permitir hacer clic en el label para expandir/colapsar
    label.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleNode(li, metadataType);
    });
    label.style.cursor = 'pointer';

    nodeContent.appendChild(expandIcon);
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
      expandIcon.textContent = '▶';
      this.expandedNodes.delete(metadataTypeName);
    } else {
      // Expandir
      expandIcon.textContent = '▼';
      this.expandedNodes.add(metadataTypeName);

      // Si el conteo no está cargado, cargarlo ahora cuando se expande el nodo
      if (!this.componentCounts.has(metadataTypeName)) {
        // Mostrar indicador de carga animado mientras se carga
        const countsElement = this.container.querySelector(
          `.node-counts[data-metadata-type="${metadataTypeName}"]`
        );
        if (countsElement) {
          countsElement.innerHTML = '';
          const loadingIndicator = createLoadingIndicator('pulse');
          countsElement.appendChild(loadingIndicator);
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
      } else {
        // Mostrar indicador de carga animado
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
   * @param {Array} componentsA - Componentes de la org A
   * @param {Array} componentsB - Componentes de la org B
   * @returns {Array} - Array con la unión sin duplicados
   */
  unionComponents(componentsA, componentsB) {
    const componentMap = new Map();

    // Agregar componentes de la org A
    componentsA.forEach(component => {
      const key = component.fullName || component.name || component.fileName;
      if (key) {
        componentMap.set(key, {
          ...component,
          inOrgA: true,
          inOrgB: false
        });
      }
    });

    // Agregar o actualizar componentes de la org B
    componentsB.forEach(component => {
      const key = component.fullName || component.name || component.fileName;
      if (key) {
        if (componentMap.has(key)) {
          // Ya existe, marcar que está en ambas orgs
          componentMap.get(key).inOrgB = true;
        } else {
          // No existe, agregarlo
          componentMap.set(key, {
            ...component,
            inOrgA: false,
            inOrgB: true
          });
        }
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
      const li = document.createElement('li');
      li.className = 'tree-leaf';
      li.dataset.componentName = component.fullName || component.name || component.fileName;

      // Crear contenedor para el símbolo y el nombre
      const componentContent = document.createElement('div');
      componentContent.className = 'component-content';

      // Crear símbolo según en qué orgs está
      const symbol = document.createElement('span');
      symbol.className = 'component-symbol';

      if (component.inOrgA && component.inOrgB) {
        // IMPORTANTE: No podemos determinar si son iguales solo con metadatos porque:
        // - Las fechas pueden ser diferentes pero el contenido idéntico
        // - Una clase puede crearse en un org y desplegarse meses después a otro
        // Por lo tanto, mostramos "?" (desconocido) y solo compararemos el contenido
        // real cuando el usuario haga clic para ver el diff
        symbol.textContent = '?';
        symbol.className += ' symbol-both symbol-unknown';
        symbol.title = 'Haz clic para comparar contenido';
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
      const name = component.fullName || component.name || component.fileName;
      nameSpan.textContent = name;

      componentContent.appendChild(symbol);
      componentContent.appendChild(nameSpan);
      li.appendChild(componentContent);

      // Si el componente está en ambas orgs, hacer clickeable para ver el diff
      if (component.inOrgA && component.inOrgB) {
        li.style.cursor = 'pointer';
        li.addEventListener('click', () => {
          // Abrir diff para cualquier componente en ambas orgs (igual o diferente)
          this.openDiffViewer(component, metadataTypeName);
        });
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
  async openDiffViewer(component, metadataTypeName) {
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
    diffPanelTitle.textContent = `${metadataTypeName}: ${componentName}`;

    // Actualizar etiquetas de las orgs
    const diffLabelA = document.getElementById('diffLabelA');
    const diffLabelB = document.getElementById('diffLabelB');
    if (diffLabelA) diffLabelA.textContent = `Org A: ${this.orgAliasA}`;
    if (diffLabelB) diffLabelB.textContent = `Org B: ${this.orgAliasB}`;

    // Destruir el editor anterior si existe antes de limpiar el container
    // Esto evita errores de "node to be removed is not a child"
    try {
      const { destroyDiffViewer } = await import('./diffViewer.js');
      destroyDiffViewer();
    } catch (err) {
      // Ignorar errores al destruir el editor anterior
      console.warn('Error destroying previous diff viewer:', err);
    }

    // Mostrar indicador de carga animado
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'loading';
    const loadingIndicator = createLoadingIndicator('spinner', 'Cargando contenido');
    loadingDiv.appendChild(loadingIndicator);
    diffViewer.innerHTML = '';
    diffViewer.appendChild(loadingDiv);

    // Limpiar el textarea mientras se carga
    const orgACodeTextarea = document.getElementById('orgACodeTextarea');
    if (orgACodeTextarea) {
      orgACodeTextarea.value = '';
    }

    // Hacer la carga asíncrona sin bloquear la UI
    try {
      // Obtener contenido de ambas orgs
      const [responseA, responseB] = await Promise.all([
        fetch(`/api/component-content/${encodeURIComponent(this.orgAliasA)}/${encodeURIComponent(metadataTypeName)}/${encodeURIComponent(componentName)}`),
        fetch(`/api/component-content/${encodeURIComponent(this.orgAliasB)}/${encodeURIComponent(metadataTypeName)}/${encodeURIComponent(componentName)}`)
      ]);

      const dataA = await responseA.json();
      const dataB = await responseB.json();

      if (dataA.success && dataB.success) {
        // Inicializar Monaco Editor diff viewer
        const { initDiffViewer } = await import('./diffViewer.js');

        // Determinar el lenguaje según el tipo de metadata
        const language = this.getLanguageForMetadataType(metadataTypeName);

        // Mostrar contenido: Org A a la izquierda, Org B a la derecha
        await initDiffViewer('diffViewer', dataA.content, dataB.content, language);

        // Mostrar el código de la Org A en el textarea
        const orgACodeTextarea = document.getElementById('orgACodeTextarea');
        if (orgACodeTextarea) {
          orgACodeTextarea.value = dataA.content;
        }
      } else {
        const errorMsg = dataA.error || dataB.error || 'Error desconocido';
        const fullErrorMsg = `Error al cargar el contenido: ${errorMsg}`;
        diffViewer.innerHTML = '';
        diffViewer.appendChild(this.createErrorElement(fullErrorMsg));
      }
    } catch (error) {
      console.error('Error opening diff viewer:', error);
      const fullErrorMsg = `Error al abrir el visor de diferencias: ${error.message}`;
      diffViewer.innerHTML = '';
      diffViewer.appendChild(this.createErrorElement(fullErrorMsg));
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

    if (countsElement) {
      countsElement.textContent = `A: ${countA} B: ${countB}`;
      // Mostrar el elemento cuando se actualiza el conteo
      countsElement.style.display = 'inline';
    }
  }

  /**
   * Filtra los nodos de metadata types según el texto de búsqueda
   * @param {string} filterText - Texto para filtrar
   */
  filterMetadataTypes(filterText) {
    const filterLower = filterText.toLowerCase().trim();
    const allNodes = this.container.querySelectorAll('.tree-node');

    if (!filterLower) {
      // Si no hay filtro, mostrar todos los nodos
      allNodes.forEach(node => {
        node.style.display = '';
      });
      return;
    }

    // Filtrar nodos
    allNodes.forEach(node => {
      const _label = node.querySelector('.node-label');
      const nodeName = node.querySelector('.node-name');
      const nodeText = nodeName ? nodeName.textContent.toLowerCase() : '';

      if (nodeText.includes(filterLower)) {
        node.style.display = '';
      } else {
        node.style.display = 'none';
      }
    });
  }
}

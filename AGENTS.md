# OrgDiff - Guía para Agentes IA

## Overview del Proyecto

OrgDiff es una herramienta web desarrollada en Node.js + Express (backend) y Vanilla JavaScript (frontend) que permite comparar metadata entre dos orgs de Salesforce. La herramienta está diseñada para facilitar la gestión y sincronización de metadata entre diferentes orgs, típicamente entre sandboxes.

### Propósito Principal

Permitir a los desarrolladores de Salesforce:
- Comparar tipos de metadata y componentes entre dos orgs
- Visualizar diferencias entre componentes específicos
- Gestionar y resolver diferencias entre orgs
- Realizar deploy de componentes desde una org a otra
- Todo sin necesidad de cambiar la default org del CLI constantemente

## Arquitectura

### Backend
- **Node.js + Express**: Servidor web que expone APIs REST
- **Salesforce CLI**: Todos los comandos se ejecutan a través de `sf` CLI (asume que está instalado y configurado)
- **Módulo de servicios**: `src/services/salesforce.js` abstrae la ejecución de comandos CLI

### Frontend
- **Vanilla JavaScript**: Sin frameworks, JavaScript puro con módulos ES6
- **Monaco Editor**: Para visualización de diffs de código (preparado para futuras fases)
- **TreeView personalizado**: Implementación propia para mostrar metadata types y componentes

## Flujo de la Aplicación

### Paso 1: Selección de Orgs
1. La aplicación carga automáticamente la lista de orgs disponibles usando `sf org list --json`
2. **Auto-selección de orgs de prueba**: Si existen las orgs "DEVSERVICE" y "Vodafone - dev11pro" en la lista, se seleccionan automáticamente:
   - **DEVSERVICE** → seleccionada automáticamente en **Org A**
   - **Vodafone - dev11pro** → seleccionada automáticamente en **Org B**
3. El usuario puede modificar la selección si lo desea
4. Al hacer click en "Continuar":
   - Se valida que las orgs sean diferentes
   - Se valida que ambas orgs sean accesibles usando `sf org display --target-org "<alias>" --json`
   - Si alguna org no es accesible (expirada, sin permisos, etc.), se muestra un error
   - Si ambas orgs son válidas, se pasa al siguiente paso

### Paso 2: Visualización de Metadata Types
1. Se cargan los tipos de metadata para **ambas orgs** en paralelo usando `sf org list metadata-types --target-org "<alias>" --json`
2. Se **comparan** los tipos de metadata entre las dos orgs:
   - Si hay una diferencia significativa (más del 10% de diferencia), se muestra un **warning** indicando que algunos tipos de metadata pueden no estar visibles debido a permisos insuficientes o diferencias en la configuración
   - El warning muestra qué org tiene más tipos y la diferencia porcentual
3. Se renderiza un **treeview** con la **unión** de todos los tipos de metadata de ambas orgs (sin duplicados)
4. Cada tipo de metadata aparece como un **nodo expandible** (carpeta)
5. Al expandir un nodo (ej: ApexClass):
   - Se muestra un indicador de carga
   - Se hace una llamada a `/api/metadata/:orgAlias/:metadataType` que ejecuta `sf org list metadata --metadata-type <tipo> --target-org "<alias>" --json`
   - Se renderizan los componentes como **nodos hoja** (hijos del tipo de metadata)
   - Los componentes se cachean para evitar recargas innecesarias

### Paso 3: Comparación y Gestión (Futuras Fases)
- Visualización de diferencias usando Monaco Editor diff viewer
- Deploy de componentes desde una org a otra
- Resolución de conflictos
- Filtrado y búsqueda

## Estrategia de Rendimiento

**CRÍTICO**: La herramienta está diseñada para ser eficiente y no requerir esperas largas:

1. **Listado inicial rápido**: Solo se listan los tipos de metadata (sin contenido)
2. **Carga bajo demanda**: Los componentes se cargan solo cuando el usuario expande un tipo
3. **Solo nombres**: Al expandir, solo se obtienen nombres y metadatos básicos, NO el contenido completo
4. **Contenido completo**: El contenido completo se descarga solo cuando el usuario abre el diff de un componente específico

Esta estrategia evita tener que esperar horas descargando toda la metadata antes de poder trabajar.

## Comandos Salesforce CLI Utilizados

### `sf org list --json`
Lista todas las orgs autorizadas en el CLI. No requiere `--target-org`.

### `sf org display --target-org "<alias>" --json`
Valida que una org es accesible. Se usa para verificar que las orgs seleccionadas funcionan antes de continuar.

### `sf org list metadata-types --target-org "<alias>" --json`
Obtiene todos los tipos de metadata disponibles en una org. **Crítico** porque devuelve todos los tipos, incluyendo los que puedan aparecer en futuras releases de Salesforce.

### `sf org list metadata --metadata-type <tipo> --target-org "<alias>" --json`
Lista solo los nombres de componentes de un tipo específico (sin contenido completo). **Optimización crítica de rendimiento**.

## Uso de --target-org

**IMPORTANTE**: Todos los comandos que requieren una org específica usan `--target-org "<alias>"` (con comillas para manejar espacios). Esto permite:
- Ejecutar comandos en diferentes orgs sin cambiar la default org del CLI
- Evitar tener que cambiar y restaurar la configuración constantemente
- Trabajar con múltiples orgs simultáneamente

## Estructura del Proyecto

```
OrgDiff/
├── package.json              # Dependencias y scripts
├── server.js                 # Servidor Express
├── README.md                 # Documentación general del proyecto
├── AGENTS.md                 # Este archivo (guía para agentes IA)
├── CONTEXT.md                # Documentación técnica detallada para agentes IA
├── public/                   # Archivos estáticos del frontend
│   ├── index.html
│   ├── css/
│   │   └── styles.css
│   └── js/
│       ├── app.js            # Lógica principal
│       ├── treeView.js       # Módulo del treeview
│       └── diffViewer.js    # Módulo de Monaco Editor (futuras fases)
├── src/                      # Código del backend
│   └── services/
│       └── salesforce.js     # Servicio para ejecutar comandos CLI
└── tmp/                      # Archivos temporales (scripts, diagramas, imágenes, markdown extensos)
```

## Reglas Críticas para Agentes IA

### ⚠️ Archivos Temporales - REGLA ABSOLUTA

**CUALQUIER archivo temporal DEBE crearse SIEMPRE en la carpeta `tmp/`**

Esto incluye:
- Scripts temporales
- Diagramas generados
- Imágenes creadas
- Archivos Markdown extensos para guardar información
- Cualquier archivo que no sea parte del código fuente permanente

**NO crear archivos temporales fuera de `tmp/`**. Esto evita desparramar archivos por todo el proyecto.

### Convenciones de Código
- Código en inglés (nombres de variables, funciones, clases)
- Comentarios en inglés
- Uso de camelCase para nombres
- Módulos ES6 (import/export)

### Preferencias de Herramientas
- **Siempre preferir herramientas MCP sobre comandos CLI directos** cuando sea posible
- Por ejemplo: usar `executeQuery` del servidor MCP de Salesforce en lugar de `sf data query`
- Usar herramientas MCP de Github en lugar de comandos git directos

## Endpoints de la API

### `GET /api/orgs`
Obtiene la lista de orgs autorizadas en el CLI.

**Respuesta**:
```json
{
  "success": true,
  "orgs": [
    {
      "alias": "DEVSERVICE",
      "username": "user@example.com",
      "orgId": "00D...",
      "instanceUrl": "https://...",
      "isDefaultUsername": false
    }
  ]
}
```

### `GET /api/orgs/validate/:orgAlias`
Valida que una org es accesible y no está expirada.

**Respuesta**:
```json
{
  "success": true,
  "org": {
    "alias": "DEVSERVICE",
    "username": "user@example.com",
    "orgId": "00D...",
    "instanceUrl": "https://..."
  }
}
```

### `GET /api/metadata-types/:orgAlias`
Obtiene los tipos de metadata disponibles en una org.

**Respuesta**:
```json
{
  "success": true,
  "metadataTypes": [
    {
      "metadataType": "ApexClass",
      "directoryName": "classes"
    }
  ]
}
```

### `GET /api/metadata/:orgAlias/:metadataType`
Obtiene la lista de componentes de un tipo de metadata específico (solo nombres, sin contenido).

**Respuesta**:
```json
{
  "success": true,
  "components": [
    {
      "fullName": "MyClass",
      "type": "ApexClass"
    }
  ]
}
```

## Instalación y Ejecución

```bash
# Instalar dependencias
npm install

# Ejecutar en modo desarrollo (con watch)
npm run dev

# Ejecutar en producción
npm start
```

El servidor se ejecuta en `http://localhost:3000` por defecto.

## Estado Actual del Proyecto

### ✅ Implementado
- Selección de orgs con validación
- **Auto-selección de orgs de prueba** (DEVSERVICE y Vodafone - dev11pro)
- Validación de acceso a orgs
- TreeView de metadata types
- **Comparación de tipos de metadata entre orgs con warning** si hay diferencias significativas (indica posibles tipos ocultos por permisos)
- Carga bajo demanda de componentes
- Optimización de rendimiento (solo nombres, no contenido)
- Cache de orgs en localStorage para carga rápida inicial

### 🚧 Futuras Fases
- Comparación visual de componentes usando Monaco Editor diff viewer
- Deploy de componentes desde una org a otra
- Resolución de conflictos
- Filtrado y búsqueda de metadata types y componentes
- Exportación de diferencias

## Funcionalidades Recientes Añadidas

### Auto-selección de Orgs de Prueba
Para acelerar las pruebas durante el desarrollo, la aplicación ahora selecciona automáticamente las siguientes orgs si están disponibles en la lista:
- **DEVSERVICE** → seleccionada automáticamente en **Org A**
- **Vodafone - dev11pro** → seleccionada automáticamente en **Org B**

Esta funcionalidad está implementada en la función `populateOrgSelects()` del archivo `public/js/app.js`. La selección automática ocurre después de poblar los desplegables, y el usuario puede modificar la selección si lo desea.

### Detección de Tipos de Metadata Ocultos por Permisos
La aplicación ahora compara automáticamente el número de tipos de metadata entre las dos orgs seleccionadas. Si detecta una diferencia significativa (más del 10% de diferencia), muestra un warning indicando que algunos tipos de metadata pueden no estar visibles debido a permisos insuficientes o diferencias en la configuración de las orgs.

**Implementación:**
- Se cargan los tipos de metadata de ambas orgs en paralelo
- Se compara el número de tipos retornados
- Si la diferencia es mayor al 10%, se muestra un warning con detalles
- El treeview muestra la unión de todos los tipos de metadata de ambas orgs (sin duplicados)

Esta funcionalidad está implementada en la función `checkMetadataTypesDifference()` del archivo `public/js/app.js`.

## Dependencias

- **express**: Framework web para el servidor
- **monaco-editor**: Editor de código de VS Code con soporte para diff viewer

## Requisitos Previos

- Node.js instalado
- Salesforce CLI (`sf`) instalado y configurado
- Al menos dos orgs autorizadas en el CLI

## Notas para Desarrolladores

- El proyecto asume que Salesforce CLI está instalado y configurado
- Todas las operaciones usan `--target-org` para no cambiar la default org
- La estrategia de rendimiento es crítica: solo cargar lo necesario cuando sea necesario
- El treeview cachea componentes cargados para evitar recargas innecesarias
- Las orgs se cachean en localStorage para una carga inicial más rápida
- La auto-selección de orgs de prueba facilita el desarrollo y testing

## Manejo de Errores

Todos los endpoints devuelven respuestas JSON consistentes:
- `success: true` cuando la operación es exitosa
- `success: false` cuando hay un error, junto con un mensaje descriptivo

Los errores del frontend se muestran en un elemento `errorMessage` que se oculta automáticamente después de 5 segundos.

## Consideraciones de Rendimiento

1. **No descargar todo el contenido de una vez**: Solo se descargan nombres de componentes cuando se expande un tipo
2. **Cache de componentes**: Los componentes ya cargados se mantienen en memoria para evitar recargas
3. **Cache de orgs**: La lista de orgs se guarda en localStorage para carga rápida inicial
4. **Validación paralela**: Las validaciones de orgs se hacen en paralelo usando `Promise.all()`



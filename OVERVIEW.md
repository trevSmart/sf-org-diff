# OrgDiff - Overview del Proyecto

## Descripción General

**OrgDiff** es una herramienta web desarrollada en Node.js que permite comparar metadata entre dos organizaciones de Salesforce. La aplicación facilita la visualización de diferencias entre tipos de metadata y componentes, ayudando a los desarrolladores a gestionar y sincronizar metadata entre diferentes orgs (típicamente entre sandboxes o entre sandbox y producción).

## Propósito y Objetivos

El objetivo principal de OrgDiff es proporcionar una interfaz visual e intuitiva para:
- Comparar los tipos de metadata disponibles en dos orgs diferentes
- Visualizar los componentes de cada tipo de metadata en cada org
- Identificar diferencias entre orgs (componentes que existen en una org pero no en la otra)
- Facilitar la gestión de metadata en entornos de desarrollo Salesforce

## Arquitectura del Proyecto

### Stack Tecnológico

**Backend:**
- **Node.js** con módulos ES6 (import/export)
- **Express.js** como framework web para el servidor
- **Salesforce CLI (sf)** para interactuar con las orgs de Salesforce
- **child_process** (nativo de Node.js) para ejecutar comandos CLI

**Frontend:**
- **Vanilla JavaScript** (sin frameworks) con módulos ES6
- **Monaco Editor** (preparado para futuras fases de visualización de diffs)
- **HTML5/CSS3** para la interfaz de usuario
- Implementación propia de TreeView para mostrar metadata types y componentes

### Estructura de Directorios

```
OrgDiff/
├── package.json              # Configuración del proyecto y dependencias
├── server.js                 # Servidor Express principal
├── index.js                  # Archivo de prueba (no utilizado en producción)
├── OVERVIEW.md               # Este archivo - documentación completa del proyecto
├── CONTEXT.md                # Contexto técnico del proyecto
├── .gitignore                # Archivos ignorados por Git
├── public/                   # Archivos estáticos del frontend
│   ├── index.html            # Página principal de la aplicación
│   ├── css/
│   │   └── styles.css        # Estilos de la aplicación
│   └── js/
│       ├── app.js            # Lógica principal de la aplicación (pantallas, flujo)
│       ├── treeView.js       # Módulo para gestionar el treeview de metadata
│       └── diffViewer.js     # Módulo para Monaco Editor diff viewer (futuras fases)
├── src/                      # Código del backend
│   └── services/
│       └── salesforce.js     # Servicio que abstrae la ejecución de comandos CLI
└── tmp/                      # ⚠️ CARPETA PARA ARCHIVOS TEMPORALES
```

## Flujo de Trabajo y Pasos

### Pantalla 1: Selección de Orgs

1. **Carga inicial**: Al cargar la aplicación, se obtiene la lista de orgs disponibles mediante el endpoint `/api/orgs`
2. **Selección**: El usuario selecciona dos orgs diferentes (Org A y Org B) desde desplegables
3. **Validación**: Al hacer clic en "Continuar":
   - Se valida que ambas orgs hayan sido seleccionadas
   - Se valida que las orgs sean diferentes
   - Se valida que ambas orgs sean accesibles mediante `/api/orgs/validate/:orgAlias`
   - Si alguna validación falla, se muestra un mensaje de error
   - Si ambas orgs son válidas, se pasa a la Pantalla 2

### Pantalla 2: TreeView de Metadata Types

1. **Carga de metadata types**: Se cargan simultáneamente los tipos de metadata para ambas orgs mediante `/api/metadata-types/:orgAlias`
2. **Renderizado**: Se renderizan dos treeviews (uno por cada org) mostrando todos los tipos de metadata disponibles
3. **Expansión bajo demanda**: Cuando el usuario expande un tipo de metadata:
   - Se muestra un indicador de carga
   - Se hace una petición a `/api/metadata/:orgAlias/:metadataType` para obtener los componentes de ese tipo
   - Se renderizan los componentes como hijos del nodo expandido
   - Los componentes se cachean para evitar recargas innecesarias

## Acciones Principales

### Backend (server.js)

1. **Servir archivos estáticos**: Express sirve los archivos de `public/` como contenido estático
2. **API REST**: Expone endpoints para:
   - Obtener lista de orgs
   - Validar orgs
   - Obtener tipos de metadata
   - Obtener componentes de un tipo de metadata específico

### Servicio Salesforce (src/services/salesforce.js)

1. **Ejecución de comandos CLI**: Abstrae la ejecución de comandos de Salesforce CLI
2. **Gestión de parámetros**: Maneja automáticamente el parámetro `--target-org` con comillas para soportar alias con espacios
3. **Parsing de respuestas**: Parsea las respuestas JSON de los comandos CLI y maneja errores

### Frontend (public/js/)

1. **app.js**: Gestiona el flujo de la aplicación, las pantallas, y la comunicación con la API
2. **treeView.js**: Implementa la lógica del treeview, maneja la expansión de nodos y la carga de componentes
3. **diffViewer.js**: Preparado para futuras fases de visualización de diffs con Monaco Editor

## Endpoints de la API

### `GET /api/orgs`
Obtiene la lista de orgs autorizadas en el Salesforce CLI.

**Respuesta exitosa:**
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

**Respuesta exitosa:**
```json
{
  "success": true,
  "org": {
    "id": "00D...",
    "accessToken": "...",
    "instanceUrl": "https://...",
    ...
  }
}
```

### `GET /api/metadata-types/:orgAlias`
Obtiene todos los tipos de metadata disponibles en una org específica.

**Respuesta exitosa:**
```json
{
  "success": true,
  "metadataTypes": [
    {
      "xmlName": "ApexClass",
      "directoryName": "classes",
      "inFolder": false,
      "metaFile": true,
      "suffix": "cls",
      "childXmlNames": []
    }
  ]
}
```

### `GET /api/metadata/:orgAlias/:metadataType`
Obtiene la lista de componentes de un tipo de metadata específico (solo nombres y metadatos básicos, sin contenido completo).

**Respuesta exitosa:**
```json
{
  "success": true,
  "components": [
    {
      "fullName": "MyApexClass",
      "fileName": "classes/MyApexClass.cls",
      "id": "01p...",
      "type": "ApexClass",
      "createdDate": "2024-01-01T00:00:00.000Z",
      "lastModifiedDate": "2024-01-01T00:00:00.000Z",
      "manageableState": "unmanaged"
    }
  ]
}
```

## Comandos Salesforce CLI Utilizados

### `sf org list --json`
Obtiene la lista de orgs autorizadas en el CLI. No requiere `--target-org` ya que lista todas las orgs disponibles.

### `sf org display --target-org "<alias>" --json`
Valida que una org es accesible y no está expirada. Devuelve información básica de la org. Si falla, indica que la org no está disponible.

**Uso**: Se ejecuta para ambas orgs seleccionadas antes de continuar a la pantalla de metadata types.

### `sf org list metadata-types --target-org "<alias>" --json`
Obtiene todos los tipos de metadata disponibles en una org específica. Este comando es crítico porque devuelve todos los tipos de metadata, incluyendo los que puedan aparecer en futuras releases de Salesforce, asegurando que la herramienta siga funcionando sin necesidad de actualizaciones manuales.

**Respuesta**: Array de objetos con propiedades:
- `xmlName`: Nombre del tipo de metadata (ej: "ApexClass", "CustomObject")
- `directoryName`: Directorio donde se almacena
- `inFolder`: Si está en una carpeta
- `metaFile`: Si tiene archivo de metadata
- `suffix`: Sufijo del archivo
- `childXmlNames`: Tipos de metadata hijos (si los hay)

### `sf org list metadata --metadata-type <tipo> --target-org "<alias>" --json`
**OPTIMIZACIÓN CRÍTICA**: Lista solo los nombres y metadatos básicos de componentes de un tipo específico (ej: todas las clases Apex) SIN descargar el contenido completo. Esto permite listar rápidamente todos los componentes y descargar el contenido completo solo cuando se necesite (al abrir el diff), mejorando significativamente el rendimiento.

**Uso**: Se ejecuta bajo demanda cuando el usuario expande un tipo de metadata en el treeview.

**Respuesta**: Array de objetos con propiedades:
- `fullName`: Nombre completo del componente
- `fileName`: Ruta del archivo
- `id`: ID del componente
- `type`: Tipo de metadata
- `createdDate`, `lastModifiedDate`: Fechas
- `manageableState`: Estado (unmanaged, installed, etc.)

## Estrategia de Rendimiento

1. **Listado inicial rápido**: Se listan todos los tipos de metadata disponibles (rápido, sin contenido)
2. **Visualización**: Se muestran solo los nombres de los tipos de metadata en un treeview
3. **Carga bajo demanda**: Cuando el usuario expande un tipo, se listan solo los nombres de componentes de ese tipo (rápido)
4. **Contenido completo**: El contenido completo se descargará solo cuando el usuario abra el diff de un componente específico (futuras fases)

Esta estrategia evita tener que esperar horas descargando toda la metadata antes de poder trabajar.

## Uso de --target-org

**IMPORTANTE**: Todos los comandos que requieren una org específica usan el parámetro `--target-org "<alias>"` (con comillas para manejar alias con espacios). Esto permite ejecutar comandos en diferentes orgs sin cambiar la default org del CLI, evitando tener que cambiar y restaurar la configuración.

Ejemplo:
```bash
sf org list metadata-types --target-org "DEVSERVICE" --json
```

## Reglas Críticas del Proyecto

### ⚠️ ARCHIVOS TEMPORALES - REGLA CRÍTICA

**MANDATORIO**: Cualquier archivo temporal (scripts temporales, diagramas, imágenes generadas, archivos Markdown extensos para guardar información, archivos de prueba, etc.) **DEBE crearse SIEMPRE en la carpeta `tmp/`** en la raíz del proyecto.

**NUNCA** crear archivos temporales fuera de `tmp/`. Esto evita desparramar archivos por todo el proyecto y mantiene el workspace limpio.

**Ejemplos de archivos que DEBEN ir en `tmp/`:**
- Scripts temporales de prueba
- Diagramas generados (Mermaid, imágenes, etc.)
- Archivos Markdown extensos con información temporal
- Imágenes de capturas de pantalla
- Archivos de log temporales
- Cualquier archivo que no sea parte del código fuente del proyecto

### Convenciones de Código

- **Código en inglés**: Todos los nombres de variables, funciones, clases y módulos deben estar en inglés
- **Comentarios en inglés**: Todos los comentarios en el código deben estar en inglés
- **Naming**: Uso de camelCase para nombres de variables y funciones
- **Módulos ES6**: Uso de import/export en lugar de require/module.exports
- **Respuestas al usuario**: Las respuestas a los usuarios pueden estar en el idioma del usuario, pero el código siempre en inglés

### Preferencias de Herramientas

- **MCP Tools sobre CLI**: Siempre preferir usar herramientas MCP (como las del IBM Salesforce Context MCP server) sobre comandos CLI directos cuando estén disponibles
- **Salesforce CLI**: Para comandos de Salesforce, se usa el CLI directamente a través de `child_process` ya que no hay herramientas MCP específicas para estos comandos

## Dependencias

### Producción
- **express**: ^4.18.2 - Framework web para el servidor
- **monaco-editor**: ^0.45.0 - Editor de código de VS Code con soporte para diff viewer (preparado para futuras fases)

### Desarrollo
- Node.js con soporte para módulos ES6 (import/export)
- Salesforce CLI (`sf`) instalado y configurado en el sistema

## Ejecución del Proyecto

### Instalación
```bash
npm install
```

### Desarrollo
```bash
npm run dev
```
Ejecuta el servidor con `--watch` para recargar automáticamente en cambios.

### Producción
```bash
npm start
```
Ejecuta el servidor en modo producción.

El servidor se ejecuta en `http://localhost:3000` por defecto (o el puerto especificado en la variable de entorno `PORT`).

## Futuras Fases (No Implementadas)

- **Comparación visual de componentes**: Usar Monaco Editor diff viewer para mostrar diferencias entre componentes
- **Deploy de componentes**: Permitir desplegar componentes desde una org a otra
- **Resolución de conflictos**: Herramientas para resolver conflictos entre orgs
- **Filtrado y búsqueda**: Filtros y búsqueda de metadata types y componentes
- **Exportación de diferencias**: Exportar reportes de diferencias entre orgs
- **Descarga de contenido completo**: Implementar la descarga del contenido completo de componentes cuando se necesite para el diff

## Notas Importantes para Agentes de IA

1. **No crear archivos temporales fuera de `tmp/`**: Esta es una regla crítica que debe seguirse siempre
2. **Usar MCP tools cuando sea posible**: Preferir herramientas MCP sobre comandos CLI directos
3. **Mantener código en inglés**: Todo el código, nombres y comentarios deben estar en inglés
4. **Estrategia de rendimiento**: Respetar la estrategia de carga bajo demanda - no descargar todo el contenido de una vez
5. **Manejo de errores**: Todos los endpoints deben devolver respuestas JSON consistentes con `success: true/false`
6. **Validación de orgs**: Siempre validar que las orgs sean accesibles antes de intentar operaciones con ellas
7. **Uso de --target-org**: Siempre usar `--target-org "<alias>"` con comillas para manejar alias con espacios

## Contacto y Documentación Adicional

- **CONTEXT.md**: Contiene contexto técnico adicional del proyecto
- **package.json**: Configuración del proyecto y scripts disponibles



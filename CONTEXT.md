# OrgDiff - Contexto del Proyecto

## Descripción General

OrgDiff es una herramienta web para comparar metadata entre dos orgs de Salesforce. Permite visualizar diferencias entre tipos de metadata y componentes, facilitando la gestión y sincronización de metadata entre diferentes orgs (típicamente sandboxes).

## Arquitectura

### Backend
- **Node.js + Express**: Servidor web que expone APIs REST
- **Salesforce CLI**: Todos los comandos se ejecutan a través de `sf` CLI, asumiendo que está instalado y configurado
- **Módulo de servicios**: `src/services/salesforce.js` abstrae la ejecución de comandos CLI

### Frontend
- **Vanilla JavaScript**: Sin frameworks, JavaScript puro con módulos ES6
- **Monaco Editor**: Para visualización de diffs de código (preparado para futuras fases)
- **TreeView personalizado**: Implementación propia para mostrar metadata types y componentes

## Estructura del Proyecto

```
OrgDiff/
├── package.json
├── server.js              # Servidor Express
├── public/                # Archivos estáticos del frontend
│   ├── index.html
│   ├── css/
│   │   └── styles.css
│   └── js/
│       ├── app.js         # Lógica principal de la aplicación
│       ├── treeView.js    # Módulo para gestionar el treeview
│       └── diffViewer.js  # Módulo para Monaco Editor diff viewer
├── src/                   # Código del backend
│   └── services/
│       └── salesforce.js  # Servicio para ejecutar comandos CLI
├── tmp/                   # Archivos temporales (scripts, diagramas, imágenes, markdown extensos)
└── CONTEXT.md             # Este archivo
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
4. **Contenido completo**: El contenido completo se descarga solo cuando el usuario abre el diff de un componente específico (futuras fases)

Esta estrategia evita tener que esperar horas descargando toda la metadata antes de poder trabajar.

## Uso de --target-org

**IMPORTANTE**: Todos los comandos que requieren una org específica usan el parámetro `--target-org "<alias>"` (con comillas para manejar alias con espacios). Esto permite ejecutar comandos en diferentes orgs sin cambiar la default org del CLI, evitando tener que cambiar y restaurar la configuración.

Ejemplo:
```bash
sf org list metadata-types --target-org "DEVSERVICE" --json
```

## Flujo de la Aplicación

### Pantalla 1: Selección de Orgs
1. Al cargar, se obtiene la lista de orgs disponibles (`/api/orgs`)
2. El usuario selecciona Org A y Org B en desplegables
3. Al hacer click en "Continuar":
   - Se valida que las orgs sean diferentes
   - Se valida que ambas orgs sean accesibles (`/api/orgs/validate/:orgAlias`)
   - Si alguna falla, se muestra error
   - Si ambas funcionan, se pasa a la pantalla 2

### Pantalla 2: TreeView de Metadata Types
1. Se cargan los tipos de metadata para ambas orgs (`/api/metadata-types/:orgAlias`)
2. Se renderiza un treeview para cada org (dos columnas)
3. Cada tipo de metadata es un nodo expandible
4. Al expandir un nodo:
   - Se muestra indicador de carga
   - Se hace fetch a `/api/metadata/:orgAlias/:metadataType` para obtener los componentes
   - Se renderizan los componentes como hijos del nodo
   - Los componentes se cachean para evitar recargas innecesarias

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
Valida que una org es accesible.

**Respuesta**:
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
Obtiene los tipos de metadata disponibles en una org.

**Respuesta**:
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
Obtiene la lista de componentes de un tipo de metadata específico (solo nombres, sin contenido).

**Respuesta**:
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

## Reglas Importantes

### Archivos Temporales
**CRÍTICO**: Cualquier archivo temporal (scripts temporales, diagramas, imágenes generadas, archivos Markdown extensos para guardar información) DEBE crearse SIEMPRE en la carpeta `tmp/` en la raíz del proyecto. Esto evita desparramar archivos por todo el proyecto.

### Convenciones de Código
- Código en inglés (nombres de variables, funciones, clases)
- Comentarios en inglés
- Uso de camelCase para nombres
- Módulos ES6 (import/export)

## Futuras Fases

- Comparación visual de componentes usando Monaco Editor diff viewer
- Deploy de componentes desde una org a otra
- Resolución de conflictos
- Filtrado y búsqueda de metadata types y componentes
- Exportación de diferencias

## Dependencias

- **express**: Framework web para el servidor
- **monaco-editor**: Editor de código de VS Code con soporte para diff viewer
- **child_process**: Módulo nativo de Node.js para ejecutar comandos CLI

## Ejecución

```bash
# Instalar dependencias
npm install

# Ejecutar en modo desarrollo (con watch)
npm run dev

# Ejecutar en producción
npm start
```

El servidor se ejecuta en `http://localhost:3000` por defecto.



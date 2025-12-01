import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import { readFile, mkdir, rm, readdir } from 'fs/promises';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '../../');
const TMP_DIR = join(PROJECT_ROOT, 'tmp');

// Salesforce API version used for Tooling API requests
// Update this when newer API features are needed
const SF_API_VERSION = 'v61.0';

/**
 * Mapping of metadata types to their Tooling API object names and body field
 * These types support fast content retrieval via Tooling API instead of using sf project retrieve
 * 
 * The Tooling API approach is significantly faster than sf project retrieve because:
 * 1. It directly queries the API without any file system operations
 * 2. It returns the body content directly in the response JSON
 * 3. No temp directories need to be created or cleaned up
 * 
 * For non-code metadata types (like LWC bundles, permission sets, etc.), we fall back
 * to the traditional sf project retrieve method.
 * 
 * Reference: Salesforce VS Code extensions use a similar approach via @salesforce/source-deploy-retrieve
 * but for code-only diffs, the Tooling API is optimal.
 * See: https://developer.salesforce.com/docs/atlas.en-us.api_tooling.meta/api_tooling/
 */
const TOOLING_API_TYPES = {
  'ApexClass': { object: 'ApexClass', bodyField: 'Body' },
  'ApexTrigger': { object: 'ApexTrigger', bodyField: 'Body' },
  'ApexPage': { object: 'ApexPage', bodyField: 'Markup' },
  'ApexComponent': { object: 'ApexComponent', bodyField: 'Markup' }
};

/**
 * Ejecuta un comando de Salesforce CLI
 * @param {string} command - Comando CLI a ejecutar (sin --target-org)
 * @param {string|null} orgAlias - Alias de la org (opcional). Si se proporciona, añade --target-org
 * @returns {Promise<Object>} - Resultado parseado del comando JSON
 */
export async function runCliCommand(command, orgAlias = null) {
  let fullCommand = command;

  // Si se proporciona orgAlias, añadir --target-org con comillas para manejar espacios
  if (orgAlias) {
    fullCommand = `${command} --target-org "${orgAlias}"`;
  }

  try {
    // Aumentar el maxBuffer significativamente para manejar respuestas muy grandes (100MB)
    // Esto es necesario cuando hay mucha metadata en las orgs
    const { stdout, stderr } = await execAsync(fullCommand, {
      maxBuffer: 100 * 1024 * 1024, // 100MB
      timeout: 300000 // 5 minutos de timeout para comandos largos
    });

    if (stderr && !stdout) {
      throw new Error(stderr);
    }

    // Parsear la salida JSON
    const result = JSON.parse(stdout);

    // Si el comando tiene status y es diferente de 0, crear un error con más información
    if (result.status !== undefined && result.status !== 0) {
      const error = new Error(result.message || 'Command failed');
      error.status = result.status;
      error.result = result; // Incluir el resultado completo para análisis
      throw error;
    }

    return result;
  } catch (error) {
    // Si el error es de parsing JSON, puede ser que el comando no devolvió JSON
    if (error instanceof SyntaxError) {
      throw new Error(`Failed to parse JSON output: ${error.message}`);
    }

    // Si el error es de maxBuffer, indicar que hay demasiados datos
    if (error.message && (error.message.includes('maxBuffer') || error.message.includes('stdout maxBuffer'))) {
      console.error(`Buffer overflow detected for command: ${fullCommand}`);
      throw new Error(`Command output too large (exceeded 100MB buffer). The metadata type may have too many components. Try filtering or use a different approach.`);
    }

    // Si el error es de timeout
    if (error.message && (error.message.includes('timeout') || error.message.includes('ETIMEDOUT'))) {
      console.error(`Timeout detected for command: ${fullCommand}`);
      throw new Error(`Command timed out after 5 minutes. The operation may be too large.`);
    }

    // Loggear el error completo para debugging
    console.error(`Error executing command: ${fullCommand}`);
    console.error(`Error message: ${error.message}`);
    if (error.stderr) {
      console.error(`stderr: ${error.stderr.substring(0, 500)}`); // Primeros 500 caracteres
    }

    throw error;
  }
}

/**
 * Obtiene la lista de orgs autorizadas en el CLI
 * @returns {Promise<Array>} - Array de orgs con información (alias, username, orgId)
 */
export async function getOrgList() {
  const result = await runCliCommand('sf org list --json');

  if (!result.result || !Array.isArray(result.result.nonScratchOrgs)) {
    return [];
  }

  return result.result.nonScratchOrgs.map(org => ({
    alias: org.alias || org.username,
    username: org.username,
    orgId: org.orgId,
    instanceUrl: org.instanceUrl,
    isDefaultUsername: org.isDefaultUsername || false
  }));
}

/**
 * Valida que una org es accesible y no está expirada
 * @param {string} orgAlias - Alias de la org a validar
 * @returns {Promise<Object>} - Información de la org
 */
export async function validateOrg(orgAlias) {
  const result = await runCliCommand('sf org display --json', orgAlias);
  return result.result;
}

/**
 * Gets the access token and instance URL for an org using sf org display
 * This is used for making direct API calls to Salesforce
 * @param {string} orgAlias - Alias of the org
 * @returns {Promise<{accessToken: string, instanceUrl: string}>} - Access token and instance URL
 */
async function getOrgConnection(orgAlias) {
  const result = await runCliCommand('sf org display --json', orgAlias);

  if (!result.result || !result.result.accessToken || !result.result.instanceUrl) {
    throw new Error(`Could not get connection details for org ${orgAlias}`);
  }

  return {
    accessToken: result.result.accessToken,
    instanceUrl: result.result.instanceUrl
  };
}

/**
 * Escapes a string for use in a SOQL query to prevent injection attacks
 * @param {string} value - The value to escape
 * @returns {string} - The escaped value safe for SOQL
 */
function escapeSoql(value) {
  if (!value) return '';
  // Escape single quotes by doubling them (SOQL standard)
  // Also escape backslashes which could be used for escaping
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Queries the Salesforce Tooling API to retrieve component content directly
 * This is much faster than using sf project retrieve as it doesn't create temp directories
 * Note: Uses native fetch which requires Node.js 18+
 * @param {string} orgAlias - Alias of the org
 * @param {string} objectName - Tooling API object name (e.g., 'ApexClass', 'ApexTrigger')
 * @param {string} componentName - Name of the component to retrieve
 * @param {string} bodyField - Field name containing the body/content (e.g., 'Body', 'Markup')
 * @returns {Promise<string>} - The content of the component
 */
async function queryToolingApi(orgAlias, objectName, componentName, bodyField) {
  const { accessToken, instanceUrl } = await getOrgConnection(orgAlias);

  // Escape the component name to prevent SOQL injection
  const escapedComponentName = escapeSoql(componentName);

  // Build the SOQL query to get the component body
  // For ApexClass, filter by NamespacePrefix = NULL and Status = 'Active' to exclude
  // managed package classes and inactive/deleted classes
  let query = `SELECT Id, Name, ${bodyField} FROM ${objectName} WHERE Name = '${escapedComponentName}'`;
  if (objectName === 'ApexClass') {
    query += " AND NamespacePrefix = NULL AND Status = 'Active'";
  }
  const encodedQuery = encodeURIComponent(query);

  // Make the Tooling API request using the access token
  const apiUrl = `${instanceUrl}/services/data/${SF_API_VERSION}/tooling/query/?q=${encodedQuery}`;

  const response = await fetch(apiUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Tooling API request failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();

  if (!data.records || data.records.length === 0) {
    throw new Error(`Component ${componentName} not found in org ${orgAlias}`);
  }

  const content = data.records[0][bodyField];
  if (content === null || content === undefined) {
    throw new Error(`Component ${componentName} has no content in org ${orgAlias}`);
  }

  return content;
}

/**
 * Checks if a metadata type supports fast retrieval via Tooling API
 * @param {string} metadataType - The metadata type to check
 * @returns {boolean} - True if the type supports Tooling API retrieval
 */
function supportsToolingApi(metadataType) {
  return Object.prototype.hasOwnProperty.call(TOOLING_API_TYPES, metadataType);
}

/**
 * Lists ApexClass components using Tooling API with proper filters
 * Filters by NamespacePrefix = NULL (org's own classes) and Status = 'Active'
 * @param {string} orgAlias - Alias of the org
 * @returns {Promise<Array>} - Array of ApexClass components with basic metadata
 */
async function listApexClassesViaToolingApi(orgAlias) {
  const { accessToken, instanceUrl } = await getOrgConnection(orgAlias);

  // Query for ApexClass components that are:
  // - Not from a managed package (NamespacePrefix = NULL)
  // - Active (Status = 'Active')
  const query = "SELECT Id, Name, NamespacePrefix, Status, LastModifiedDate, CreatedDate FROM ApexClass WHERE NamespacePrefix = NULL AND Status = 'Active' ORDER BY Name";
  const encodedQuery = encodeURIComponent(query);

  const apiUrl = `${instanceUrl}/services/data/${SF_API_VERSION}/tooling/query/?q=${encodedQuery}`;

  const response = await fetch(apiUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Tooling API request failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();

  if (!data.records) {
    return [];
  }

  // Map the Tooling API response to match the expected component format
  return data.records.map(record => ({
    fullName: record.Name,
    type: 'ApexClass',
    id: record.Id,
    lastModifiedDate: record.LastModifiedDate,
    createdDate: record.CreatedDate
  }));
}

/**
 * Retrieves component content using Tooling API (fast method)
 * @param {string} metadataType - Type of metadata
 * @param {string} componentName - Name of the component
 * @param {string} orgAlias - Alias of the org
 * @returns {Promise<string>} - The content of the component
 */
async function retrieveViaToolingApi(metadataType, componentName, orgAlias) {
  const config = TOOLING_API_TYPES[metadataType];
  if (!config) {
    throw new Error(`Metadata type ${metadataType} does not support Tooling API retrieval`);
  }

  return queryToolingApi(orgAlias, config.object, componentName, config.bodyField);
}

/**
 * Obtiene todos los tipos de metadata disponibles en una org
 * @param {string} orgAlias - Alias de la org
 * @returns {Promise<Array>} - Array de tipos de metadata
 */
export async function getMetadataTypes(orgAlias) {
  const result = await runCliCommand('sf org list metadata-types --json', orgAlias);

  if (!result.result || !result.result.metadataObjects) {
    return [];
  }

  return result.result.metadataObjects;
}


/**
 * Verifica si un componente pertenece a un namespace de terceros
 * Los componentes de terceros tienen dos guiones bajos (__) en el nombre o un namespacePrefix
 * @param {Object} component - Componente a verificar
 * @returns {boolean} - true si es de un namespace de terceros, false si es propio
 */
function isThirdPartyComponent(component) {
  // Si tiene namespacePrefix, es de un paquete de terceros
  if (component.namespacePrefix) {
    return true;
  }

  // Si el fullName contiene dos guiones bajos (__), es de un namespace de terceros
  const fullName = component.fullName || component.name || '';
  if (fullName.includes('__')) {
    return true;
  }

  return false;
}

/**
 * Lista los componentes de un tipo de metadata específico (solo nombres, sin contenido)
 * Filtra automáticamente los componentes de paquetes de terceros (con namespace prefix)
 * For ApexClass, uses Tooling API with NamespacePrefix = NULL and Status = 'Active' filters
 * @param {string} metadataType - Tipo de metadata (ej: "ApexClass")
 * @param {string} orgAlias - Alias de la org
 * @returns {Promise<Array>} - Array de componentes con metadatos básicos (sin componentes de terceros)
 */
export async function listMetadataComponents(metadataType, orgAlias) {
  try {
    // For ApexClass, use Tooling API for faster listing with proper filters
    if (metadataType === 'ApexClass') {
      try {
        console.log(`Using Tooling API for fast listing of ApexClass components from ${orgAlias}`);
        return await listApexClassesViaToolingApi(orgAlias);
      } catch (toolingError) {
        console.warn(`Tooling API listing failed for ApexClass in ${orgAlias}, falling back to CLI: ${toolingError.message}`);
        // Fall through to the traditional method
      }
    }

    // Traditional method using sf org list metadata command
    // Escapar el metadataType para evitar problemas con caracteres especiales
    const escapedMetadataType = metadataType.replace(/"/g, '\\"');
    const result = await runCliCommand(`sf org list metadata --metadata-type "${escapedMetadataType}" --json`, orgAlias);

    // Si el resultado no tiene la estructura esperada, retornar array vacío
    if (!result.result) {
    return [];
  }

    // Si result.result es un array, filtrar componentes de terceros
    if (Array.isArray(result.result)) {
      // Filtrar componentes de terceros (con namespace prefix o __ en el nombre)
      return result.result.filter(component => !isThirdPartyComponent(component));
    }

    // Si result.result es un objeto con una propiedad que contiene el array
    // (algunos comandos devuelven la estructura de forma diferente)
    if (result.result.metadataObjects && Array.isArray(result.result.metadataObjects)) {
      // Filtrar componentes de terceros
      return result.result.metadataObjects.filter(component => !isThirdPartyComponent(component));
    }

    // Si no hay estructura reconocida, retornar array vacío
    return [];
  } catch (error) {
    // Si el error indica que el metadata type no existe o no está disponible,
    // retornar array vacío en lugar de lanzar error
    const errorMessage = error.message || '';
    const errorString = error.toString() || '';

    // Si el comando retorna un status de error, tratar como metadata type no disponible
    // Esto es común cuando un tipo de metadata no está habilitado en la org o versión
    if (error.status !== undefined && error.status !== 0) {
      console.warn(`Metadata type ${metadataType} returned error status ${error.status} in org ${orgAlias}. Treating as unavailable.`);
      return [];
    }

    // Errores comunes que indican que el tipo no está disponible o el comando falló
    // Algunos tipos de metadata no están disponibles en todas las orgs o versiones
    if (errorMessage.includes('not found') ||
        errorMessage.includes('does not exist') ||
        errorMessage.includes('not available') ||
        errorMessage.includes('Invalid metadata type') ||
        errorMessage.includes('Command failed') ||
        errorString.includes('not found') ||
        errorString.includes('does not exist') ||
        errorString.includes('not available') ||
        errorString.includes('Invalid metadata type') ||
        errorString.includes('Command failed')) {
      console.warn(`Metadata type ${metadataType} not available or failed in org ${orgAlias}: ${errorMessage || errorString}`);
      return [];
    }

    // Para otros errores críticos, relanzar para que el servidor lo maneje
    // Pero solo si realmente es un error inesperado
    console.error(`Unexpected error getting metadata components for ${metadataType} in org ${orgAlias}:`, error);
    throw error;
  }
}

/**
 * Recupera el contenido completo de un componente específico
 * Uses Tooling API for supported types (fast) or falls back to sf project retrieve (slow)
 * @param {string} metadataType - Tipo de metadata
 * @param {string} componentName - Nombre del componente
 * @param {string} orgAlias - Alias de la org
 * @param {string} filePath - Optional file path for bundles
 * @returns {Promise<string>} - Contenido completo del componente
 */
export async function retrieveMetadataComponent(metadataType, componentName, orgAlias, filePath = null) {
  if (filePath && filePath.includes('..')) {
    throw new Error('Invalid file path');
  }

  // For simple metadata types without filePath, try the fast Tooling API approach first
  if (!filePath && supportsToolingApi(metadataType)) {
    try {
      console.log(`Using Tooling API for fast retrieval of ${metadataType}:${componentName} from ${orgAlias}`);
      return await retrieveViaToolingApi(metadataType, componentName, orgAlias);
    } catch (toolingError) {
      console.warn(`Tooling API retrieval failed for ${metadataType}:${componentName}, falling back to sf project retrieve: ${toolingError.message}`);
      // Fall through to the traditional method
    }
  }

  // Fall back to the traditional sf project retrieve method
  // This is used for bundles (with filePath) or unsupported metadata types
  return retrieveViaProjectRetrieve(metadataType, componentName, orgAlias, filePath);
}

/**
 * Retrieves component content using sf project retrieve (traditional method)
 * This is slower but works for all metadata types
 * @param {string} metadataType - Type of metadata
 * @param {string} componentName - Name of the component
 * @param {string} orgAlias - Alias of the org
 * @param {string} filePath - Optional file path for bundles
 * @returns {Promise<string>} - The content of the component
 */
async function retrieveViaProjectRetrieve(metadataType, componentName, orgAlias, filePath = null) {
  // Crear directorio temporal si no existe
  try {
    await mkdir(TMP_DIR, { recursive: true });
  } catch (_error) {
    // El directorio ya existe, continuar
  }

  const retrieveDir = join(TMP_DIR, `retrieve_${Date.now()}_${Math.random().toString(36).substring(7)}`);

  try {
    // Usar sf project retrieve para obtener el componente en un directorio temporal
    // El flag correcto es --output-dir, no --target-dir
    const retrieveCommand = `sf project retrieve start --metadata ${metadataType}:${componentName} --output-dir "${retrieveDir}" --target-org "${orgAlias}"`;
    const fullCommand = retrieveCommand;

    await execAsync(fullCommand, {
      maxBuffer: 100 * 1024 * 1024, // 100MB
      timeout: 300000, // 5 minutos
      cwd: PROJECT_ROOT
    });

    // Buscar el archivo del componente recursivamente en el directorio de retrieve
    // El retrieve puede crear diferentes estructuras de directorios
    let content;

    if (filePath) {
      const candidate = join(retrieveDir, filePath);
      try {
        content = await readFile(candidate, 'utf-8');
      } catch (_err) {
        // Intentar localizar la carpeta del componente y leer relativo a ella
        const componentFolder = await findComponentFolder(retrieveDir, componentName);
        if (componentFolder) {
          content = await readFile(join(componentFolder, filePath), 'utf-8');
        }
      }
    }

    if (!content) {
      content = await findComponentFile(retrieveDir, metadataType, componentName);
    }

    if (!content) {
      throw new Error(`Could not find component file for ${metadataType}:${componentName} in retrieved files`);
    }

    // Limpiar el directorio temporal
    await rm(retrieveDir, { recursive: true, force: true });

    return content;
  } catch (error) {
    // Limpiar el directorio temporal en caso de error
    try {
      await rm(retrieveDir, { recursive: true, force: true });
    } catch (_cleanupError) {
      // Ignorar errores de limpieza
    }

    const errorMessage = error.message || '';
    if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
      throw new Error(`Component ${componentName} not found in org ${orgAlias}`);
    }
    throw error;
  }
}

/**
 * Busca recursivamente el archivo del componente en el directorio de retrieve
 * @param {string} baseDir - Directorio base donde se hizo el retrieve
 * @param {string} metadataType - Tipo de metadata
 * @param {string} componentName - Nombre del componente
 * @returns {Promise<string|null>} - Contenido del archivo o null si no se encuentra
 */
async function findComponentFile(baseDir, metadataType, componentName) {
  // Primero intentar las rutas más comunes
  const commonPaths = getPossibleComponentPaths(baseDir, metadataType, componentName);

  for (const filePath of commonPaths) {
    try {
      const content = await readFile(filePath, 'utf-8');
      return content;
    } catch (_error) {
      // Continuar buscando
      continue;
    }
  }

  // Si no se encuentra en las rutas comunes, buscar recursivamente
  try {
    const foundFile = await searchFileRecursively(baseDir, componentName, metadataType);
    if (foundFile) {
      return await readFile(foundFile, 'utf-8');
    }
  } catch (error) {
    console.error('Error searching recursively for %s:', componentName, error);
  }

  return null;
}

/**
 * Busca la carpeta base del componente (útil para bundles) de forma recursiva
 * @param {string} baseDir - Directorio base del retrieve
 * @param {string} componentName - Nombre del componente
 * @returns {Promise<string|null>} - Ruta de la carpeta o null si no se encuentra
 */
async function findComponentFolder(baseDir, componentName) {
  try {
    const entries = await readdir(baseDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(baseDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === componentName) {
          return fullPath;
        }

        const found = await findComponentFolder(fullPath, componentName);
        if (found) return found;
      }
    }
  } catch (error) {
    console.error(`Error searching for component folder ${componentName}:`, error);
  }

  return null;
}

/**
 * Lista los archivos de un componente tipo bundle (carpeta) después de un retrieve
 * @param {string} metadataType
 * @param {string} componentName
 * @param {string} orgAlias
 * @returns {Promise<Array<string>>}
 */
export async function listBundleFiles(metadataType, componentName, orgAlias) {
  // Crear directorio temporal si no existe
  try {
    await mkdir(TMP_DIR, { recursive: true });
  } catch (_error) {
    // ignore
  }

  const retrieveDir = join(TMP_DIR, `retrieve_${Date.now()}_${Math.random().toString(36).substring(7)}`);

  try {
    const args = [
      'project',
      'retrieve',
      'start',
      '--metadata',
      `${metadataType}:${componentName}`,
      '--output-dir',
      retrieveDir,
      '--target-org',
      orgAlias
    ];
    await execFileAsync('sf', args, {
      maxBuffer: 100 * 1024 * 1024,
      timeout: 300000,
      cwd: PROJECT_ROOT
    });

    const componentFolder = await findComponentFolder(retrieveDir, componentName);
    const base = componentFolder || retrieveDir;

    const files = await listFilesRecursively(base, base);
    return files;
  } catch (error) {
    console.error('Error listing bundle files for %s:%s in %s:', metadataType, componentName, orgAlias, error);
    throw error;
  } finally {
    try {
      await rm(retrieveDir, { recursive: true, force: true });
    } catch (_cleanupErr) {
      // ignore
    }
  }
}

async function listFilesRecursively(dir, baseDir) {
  const files = [];

  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = await listFilesRecursively(fullPath, baseDir);
      files.push(...sub);
    } else {
      const rel = relative(baseDir, fullPath);
      files.push(rel);
    }
  }

  return files;
}

/**
 * Busca recursivamente un archivo en un directorio
 * @param {string} dir - Directorio donde buscar
 * @param {string} componentName - Nombre del componente a buscar
 * @param {string} metadataType - Tipo de metadata
 * @returns {Promise<string|null>} - Ruta del archivo encontrado o null
 */
async function searchFileRecursively(dir, componentName, metadataType) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        // Buscar recursivamente en subdirectorios
        const found = await searchFileRecursively(fullPath, componentName, metadataType);
        if (found) {
          return found;
        }
      } else if (entry.isFile()) {
        // Verificar si el archivo coincide con el componente buscado
        const fileName = entry.name;

        // Para ApexClass, buscar archivos .cls (no .cls-meta.xml)
        if (metadataType === 'ApexClass') {
          if (fileName === `${componentName}.cls` || fileName.startsWith(`${componentName}.cls`)) {
            if (!fileName.endsWith('.cls-meta.xml')) {
              return fullPath;
            }
          }
        }
        // Para ApexTrigger
        else if (metadataType === 'ApexTrigger') {
          if (fileName === `${componentName}.trigger` || fileName.startsWith(`${componentName}.trigger`)) {
            return fullPath;
          }
        }
        // Para otros tipos, buscar archivos que coincidan con el nombre
        else if (fileName.includes(componentName)) {
          // Evitar archivos de metadata (.cls-meta.xml, etc.)
          if (!fileName.endsWith('-meta.xml') || fileName.includes(componentName + '.')) {
            return fullPath;
          }
        }
      }
    }
  } catch (_error) {
    // Ignorar errores de lectura de directorio
  }

  return null;
}

/**
 * Determina las posibles rutas del archivo del componente según su tipo de metadata
 * @param {string} baseDir - Directorio base donde se hizo el retrieve
 * @param {string} metadataType - Tipo de metadata
 * @param {string} componentName - Nombre del componente
 * @returns {Array<string>} - Array de rutas posibles del archivo
 */
function getPossibleComponentPaths(baseDir, metadataType, componentName) {
  const paths = [];

  // Intentar diferentes estructuras de directorios comunes
  const possibleBasePaths = [
    join(baseDir, 'force-app', 'main', 'default'),
    join(baseDir, 'force-app', 'default'),
    join(baseDir, 'main', 'default'),
    join(baseDir, 'default'),
    baseDir
  ];

  // Mapeo de tipos de metadata a sus rutas de archivo
  const pathMap = {
    'ApexClass': [`classes/${componentName}.cls`],
    'ApexTrigger': [`triggers/${componentName}.trigger`],
    'ApexPage': [`pages/${componentName}.page`],
    'ApexComponent': [`components/${componentName}.component`],
    'PermissionSet': [`permissionsets/${componentName}.permissionset-meta.xml`]
  };

  // Para cada base path posible, intentar las rutas del tipo de metadata
  for (const basePath of possibleBasePaths) {
    if (pathMap[metadataType]) {
      paths.push(...pathMap[metadataType].map(p => join(basePath, p)));
    } else {
      // Para otros tipos, intentar diferentes estructuras comunes
      const typeToDir = {
        'LightningComponentBundle': 'lwc',
        'AuraDefinitionBundle': 'aura'
      };

      const dirName = typeToDir[metadataType] || metadataType.toLowerCase();
      const extensions = ['.js', '.html', '.css', '.xml', '.json', '.ts'];
      extensions.forEach(ext => {
        paths.push(join(basePath, dirName, componentName, componentName + ext));
        paths.push(join(basePath, dirName, componentName + ext));
      });
    }
  }

  return paths;
}

/**
 * Compara el contenido de un componente entre dos orgs de forma optimizada
 * Usa una estrategia de comparación rápida que se detiene en la primera diferencia
 * @param {string} metadataType - Tipo de metadata
 * @param {string} componentName - Nombre del componente
 * @param {string} orgAliasA - Alias de la org A
 * @param {string} orgAliasB - Alias de la org B
 * @returns {Promise<{areEqual: boolean, contentA: string, contentB: string, lastModifiedA: string, lastModifiedB: string}>}
 */
export async function compareMetadataComponent(metadataType, componentName, orgAliasA, orgAliasB) {
  // Obtener información del componente en ambas orgs (ya debería estar en cache)
  const [componentsA, componentsB] = await Promise.all([
    listMetadataComponents(metadataType, orgAliasA),
    listMetadataComponents(metadataType, orgAliasB)
  ]);

  const componentA = componentsA.find(c => {
    const name = c.fullName || c.name || c.fileName;
    return name === componentName;
  });

  const componentB = componentsB.find(c => {
    const name = c.fullName || c.name || c.fileName;
    return name === componentName;
  });

  if (!componentA || !componentB) {
    return {
      areEqual: false,
      reason: 'Component not found in one or both orgs',
      contentA: '',
      contentB: '',
      lastModifiedA: componentA?.lastModifiedDate || '',
      lastModifiedB: componentB?.lastModifiedDate || ''
    };
  }

  // IMPORTANTE: La comparación por metadatos (fechas, etc.) NO es fiable porque:
  // - Una clase puede crearse en un org un día y desplegarse a otro org meses después
  // - Las fechas serán diferentes pero el contenido puede ser idéntico
  // - El manageableState puede ser diferente pero el contenido igual
  //
  // Por lo tanto, NO podemos determinar si son iguales solo con metadatos.
  // La única forma fiable es comparar el contenido real, pero eso es lento.
  //
  // Estrategia: Retornar "unknown" para que el frontend muestre "?" y solo
  // comparar el contenido real cuando el usuario haga clic para ver el diff.
  //
  // Alternativamente, podríamos hacer una comparación rápida del contenido
  // usando retrieve, pero eso sería muy lento para 1000 componentes.

  // Por ahora, retornamos "unknown" para indicar que necesitamos comparar el contenido
  // El frontend mostrará "?" y cuando el usuario haga clic, se comparará el contenido real
  return {
    areEqual: null, // null = desconocido, necesita comparación de contenido
    contentA: JSON.stringify(componentA),
    contentB: JSON.stringify(componentB),
    lastModifiedA: componentA.lastModifiedDate,
    lastModifiedB: componentB.lastModifiedDate,
    reason: 'Content comparison required - metadata comparison is not reliable'
  };
}

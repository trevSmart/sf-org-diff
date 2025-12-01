import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  getOrgList,
  validateOrg,
  getMetadataTypes,
  listMetadataComponents,
  compareMetadataComponent,
  retrieveMetadataComponent,
  listBundleFiles
} from './services/salesforce.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3200;
const MONACO_DIR = join(__dirname, '..', 'node_modules', 'monaco-editor', 'min');
const FONTAWESOME_DIR = join(__dirname, '..', 'node_modules', '@fortawesome', 'fontawesome-free');
const NODE_MODULES_DIR = join(__dirname, '..', 'node_modules');

// Middleware para parsear JSON
app.use(express.json({ limit: '100mb' })); // Aumentar límite de JSON

// Servir Monaco Editor localmente para evitar dependencias de CDN y problemas de red
app.use('/monaco', express.static(MONACO_DIR));

// Servir Font Awesome localmente
app.use('/fontawesome', express.static(FONTAWESOME_DIR));

// Servir solo los paquetes de CodeMirror necesarios (no todo node_modules por seguridad)
const allowedPackages = ['codemirror', '@codemirror', '@lezer', '@marijn', 'style-mod', 'w3c-keyname', 'crelt'];
app.use('/node_modules', (req, res, next) => {
  // Extract the package name from the path
  const pathParts = req.path.split('/').filter(Boolean);
  if (pathParts.length === 0) {
    return res.status(404).send('Not found');
  }
  
  // Check if it's a scoped package (@scope/package) or regular package
  const packageName = pathParts[0].startsWith('@') 
    ? `${pathParts[0]}/${pathParts[1]}` 
    : pathParts[0];
  const packageScope = pathParts[0].startsWith('@') ? pathParts[0] : pathParts[0];
  
  // Only allow specific packages needed for CodeMirror
  if (!allowedPackages.some(pkg => packageScope === pkg || packageName.startsWith(pkg))) {
    return res.status(403).send('Forbidden');
  }
  
  next();
}, express.static(NODE_MODULES_DIR));

// Endpoint para obtener la lista de orgs
app.get('/api/orgs', async (req, res) => {
  try {
    const orgs = await getOrgList();
    res.json({ success: true, orgs });
  } catch (error) {
    console.error('Error getting org list:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get org list'
    });
  }
});

// Endpoint para validar una org
app.get('/api/orgs/validate/:orgAlias', async (req, res) => {
  try {
    // Decodificar el parámetro de la URL para manejar espacios y caracteres especiales
    const orgAlias = decodeURIComponent(req.params.orgAlias);
    console.log(`Validating org: ${orgAlias}`);
    const orgInfo = await validateOrg(orgAlias);
    res.json({ success: true, org: orgInfo });
  } catch (error) {
    console.error(`Error validating org ${req.params.orgAlias}:`, error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to validate org'
    });
  }
});

// Endpoint para obtener los tipos de metadata de una org
app.get('/api/metadata-types/:orgAlias', async (req, res) => {
  try {
    const orgAlias = decodeURIComponent(req.params.orgAlias);
    const metadataTypes = await getMetadataTypes(orgAlias);
    res.json({ success: true, metadataTypes });
  } catch (error) {
    console.error(`Error getting metadata types for org ${req.params.orgAlias}:`, error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get metadata types'
    });
  }
});

// Endpoint para obtener los componentes de un tipo de metadata específico
app.get('/api/metadata/:orgAlias/:metadataType', async (req, res) => {
  // Definir variables fuera del try para que estén disponibles en el catch
  let orgAlias;
  let metadataType;

  try {
    orgAlias = decodeURIComponent(req.params.orgAlias);
    metadataType = decodeURIComponent(req.params.metadataType);

    console.log(`Fetching metadata components for ${metadataType} in org ${orgAlias}...`);
    const components = await listMetadataComponents(metadataType, orgAlias);
    console.log(`Successfully fetched ${components.length} components for ${metadataType}`);

    res.json({ success: true, components });
  } catch (error) {
    // Usar las variables decodificadas o los parámetros originales como fallback
    const errorOrgAlias = orgAlias || req.params.orgAlias;
    const errorMetadataType = metadataType || req.params.metadataType;
    console.error(`Error getting metadata components for ${errorMetadataType} in org ${errorOrgAlias}:`, error);
    console.error(`Error stack:`, error.stack);

    // Asegurarse de que la respuesta no se haya enviado ya
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get metadata components'
      });
    }
  }
});

// Servir archivos estáticos desde public/ (después de las rutas de API)
app.use(express.static(join(__dirname, '..', 'public')));

// Endpoint para obtener el contenido de un componente
app.get('/api/component-content/:orgAlias/:metadataType/:componentName', async (req, res) => {
  let orgAlias;
  let metadataType;
  let componentName;
  let filePath;

  try {
    orgAlias = decodeURIComponent(req.params.orgAlias);
    metadataType = decodeURIComponent(req.params.metadataType);
    componentName = decodeURIComponent(req.params.componentName);
    filePath = req.query.file ? decodeURIComponent(req.query.file) : null;

    const content = await retrieveMetadataComponent(metadataType, componentName, orgAlias, filePath);
    res.json({ success: true, content });
  } catch (error) {
    const errorOrgAlias = orgAlias || req.params.orgAlias;
    const errorMetadataType = metadataType || req.params.metadataType;
    const errorComponentName = componentName || req.params.componentName;
    console.error(`Error getting component content ${errorComponentName} (${errorMetadataType}) from org ${errorOrgAlias}:`, error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get component content'
    });
  }
});

// Endpoint para comparar un componente entre dos orgs
app.get('/api/compare/:orgAliasA/:orgAliasB/:metadataType/:componentName', async (req, res) => {
  let orgAliasA;
  let orgAliasB;
  let metadataType;
  let componentName;

  try {
    orgAliasA = decodeURIComponent(req.params.orgAliasA);
    orgAliasB = decodeURIComponent(req.params.orgAliasB);
    metadataType = decodeURIComponent(req.params.metadataType);
    componentName = decodeURIComponent(req.params.componentName);

    const comparison = await compareMetadataComponent(metadataType, componentName, orgAliasA, orgAliasB);
    res.json({ success: true, ...comparison });
  } catch (error) {
    const errorOrgAliasA = orgAliasA || req.params.orgAliasA;
    const errorOrgAliasB = orgAliasB || req.params.orgAliasB;
    const errorMetadataType = metadataType || req.params.metadataType;
    const errorComponentName = componentName || req.params.componentName;
    console.error(`Error comparing component ${errorComponentName} (${errorMetadataType}) between ${errorOrgAliasA} and ${errorOrgAliasB}:`, error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to compare component'
    });
  }
});

// Endpoint para obtener los archivos de un componente tipo bundle
app.get('/api/bundle-files/:orgAlias/:metadataType/:componentName', async (req, res) => {
  let orgAlias;
  let metadataType;
  let componentName;

  try {
    orgAlias = decodeURIComponent(req.params.orgAlias);
    metadataType = decodeURIComponent(req.params.metadataType);
    componentName = decodeURIComponent(req.params.componentName);

    const files = await listBundleFiles(metadataType, componentName, orgAlias);
    res.json({ success: true, files });
  } catch (error) {
    const errorOrgAlias = orgAlias || req.params.orgAlias;
    const errorMetadataType = metadataType || req.params.metadataType;
    const errorComponentName = componentName || req.params.componentName;
    console.error(`Error getting bundle files for ${errorComponentName} (${errorMetadataType}) from org ${errorOrgAlias}:`, error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get bundle files'
    });
  }
});

// Manejar rutas no encontradas para API
app.use('/api/*path', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'API endpoint not found'
  });
});

// Middleware para manejar errores en las rutas (debe ir después de todas las rutas)
app.use((err, req, res, _next) => {
  console.error('Error en middleware:', err);
  console.error('Stack:', err.stack);
  if (!res.headersSent) {
    res.status(500).json({
      success: false,
      error: err.message || 'Internal server error'
    });
  }
});

// Manejo global de errores no capturados para evitar que el servidor se caiga
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  console.error('Stack:', error.stack);
  // No terminamos el proceso, solo logueamos el error
  // Esto permite que el servidor siga funcionando aunque haya errores
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
  if (reason instanceof Error) {
    console.error('Stack:', reason.stack);
  }
  // No terminamos el proceso, solo logueamos el error
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

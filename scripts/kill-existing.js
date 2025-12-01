#!/usr/bin/env node

/**
 * Script para matar procesos existentes que usan el puerto 3200
 * o procesos de node que ejecuten src/server.js
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 3200;

function killPortProcesses(port) {
  try {
    // Buscar PIDs que usen el puerto
    const pids = execSync(`lsof -ti :${port}`, { encoding: 'utf-8', stdio: 'pipe' }).trim();

    if (pids) {
      console.log(`Encontrados procesos usando el puerto ${port}: ${pids}`);
      // Matar los procesos
      execSync(`kill -9 ${pids}`, { stdio: 'pipe' });
      console.log(`Procesos en puerto ${port} terminados`);
      return true;
    }
    return false;
  } catch (_error) {
    // Si no hay procesos, lsof devuelve error, lo cual es normal
    return false;
  }
}

function killNodeProcesses() {
  try {
    // Matar procesos de node que ejecuten src/server.js
    execSync('pkill -f "node.*src/server.js"', { stdio: 'pipe' });
    console.log('Procesos de node (src/server.js) terminados');
    return true;
  } catch (_error) {
    // Si no hay procesos, pkill devuelve error, lo cual es normal
    return false;
  }
}

console.log('Deteniendo procesos anteriores...');

// Matar procesos en el puerto
killPortProcesses(PORT);

// Matar procesos de node
killNodeProcesses();

// Esperar un momento para asegurar que los procesos se hayan terminado
await new Promise(resolve => setTimeout(resolve, 1000));

// Verificación final
try {
  const remainingPids = execSync(`lsof -ti :${PORT}`, { encoding: 'utf-8', stdio: 'pipe' }).trim();
  if (remainingPids) {
    console.warn(`Advertencia: El puerto ${PORT} aún está en uso. Intentando forzar...`);
    execSync(`kill -9 ${remainingPids}`, { stdio: 'pipe' });
    await new Promise(resolve => setTimeout(resolve, 500));
  }
} catch (_error) {
  // No hay procesos, perfecto
}

console.log(`Puerto ${PORT} liberado correctamente`);

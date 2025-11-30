#!/bin/bash

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Deteniendo procesos anteriores...${NC}"

# Función para matar procesos en el puerto 3000
kill_port_processes() {
  local port=3000
  # Buscar PIDs que estén usando el puerto 3000
  local pids=$(lsof -ti :$port 2>/dev/null)

  if [ -n "$pids" ]; then
    echo -e "${YELLOW}Encontrados procesos usando el puerto $port: $pids${NC}"
    # Matar los procesos de forma forzada
    echo "$pids" | xargs kill -9 2>/dev/null
    return 0
  fi
  return 1
}

# Matar procesos que usan el puerto 3000
kill_port_processes

# También matar procesos de node que ejecuten server.js (por si acaso)
pkill -f "node.*server.js" 2>/dev/null

# Esperar un momento para asegurar que los procesos se hayan terminado
sleep 2

# Verificar si aún hay procesos usando el puerto 3000
if lsof -ti :3000 > /dev/null 2>&1; then
  echo -e "${RED}Advertencia: El puerto 3000 aún está en uso. Intentando forzar...${NC}"
  lsof -ti :3000 | xargs kill -9 2>/dev/null
  sleep 1
fi

# Verificación final
if lsof -ti :3000 > /dev/null 2>&1; then
  echo -e "${RED}Error: No se pudo liberar el puerto 3000${NC}"
  echo -e "${YELLOW}Por favor, detén manualmente los procesos que usan el puerto 3000${NC}"
  exit 1
else
  echo -e "${GREEN}Puerto 3000 liberado correctamente${NC}"
fi

echo -e "${YELLOW}Iniciando servidor...${NC}"

# Iniciar el servidor en background
node server.js > /dev/null 2>&1 &
SERVER_PID=$!

# Esperar a que el servidor esté listo (máximo 10 segundos)
echo -e "${YELLOW}Esperando a que el servidor esté listo...${NC}"
for i in {1..10}; do
  if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo -e "${GREEN}Servidor iniciado correctamente (PID: $SERVER_PID)${NC}"
    break
  fi
  if [ $i -eq 10 ]; then
    echo -e "${RED}Error: El servidor no respondió a tiempo${NC}"
    kill $SERVER_PID 2>/dev/null
    exit 1
  fi
  sleep 1
done

# Abrir Chrome con la aplicación
echo -e "${YELLOW}Abriendo Chrome...${NC}"
open -a "Google Chrome" http://localhost:3000

echo -e "${GREEN}✓ Aplicación iniciada y Chrome abierto${NC}"
echo -e "${YELLOW}Para detener el servidor, ejecuta: kill $SERVER_PID${NC}"



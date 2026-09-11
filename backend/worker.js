# ================================================================
# DOCKERFILE - SARIEL'S ECOSYSTEM
# ================================================================
# - Node.js 20 (compatible con tu package.json)
# - FFmpeg instalado (para procesar videos)
# - Compatible con Railway
# - NO incluye CMD: Railway usa el Start Command del panel
# ================================================================

FROM node:20-slim

# Instalar FFmpeg y dependencias del sistema
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ffmpeg \
        ca-certificates \
        fonts-dejavu-core \
        python3 \
        make \
        g++ \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Directorio de trabajo
WORKDIR /app

# Copiar archivos de dependencias primero (mejor caché de Docker)
COPY package*.json ./

# Instalar dependencias de Node
RUN npm install --omit=dev && npm cache clean --force

# Copiar el resto del código
COPY . .

# Exponer puerto (Railway lo asigna dinámicamente, pero ponemos uno por defecto)
EXPOSE 8080

# ⚠️ NO poner CMD aquí. Railway usará el Start Command del panel:
# - API:    node server.js
# - Worker: node worker.js
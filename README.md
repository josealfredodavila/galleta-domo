# 🍪 Galleta Domo - Sistema de Tokenización en Polygon

## 📋 Descripción

Sistema automatizado para la compra de domos de galleta con tokens en la red Polygon. Cada compra genera un QR único y otorga tokens que pueden ser canjeados por NFTs.

## ✨ Características

- ✅ Compra de domos con tokens Polygon (MATIC)
- ✅ Generación automática de QR por cada domo
- ✅ Acumulación de tokens (1 token por domo)
- ✅ Canje de NFT al acumular 12 tokens
- ✅ Quema automática de tokens al canjear
- ✅ Dashboard de usuario con historial
- ✅ Seguridad implementada (sin exposición de seeds)
- ✅ Diseño futurista verde esmeralda
- ✅ Totalmente automatizado

## 🛠️ Tecnologías

- **Blockchain**: Polygon (MATIC)
- **Smart Contracts**: Solidity + OpenZeppelin
- **Backend**: Node.js + Express + MongoDB
- **Frontend**: HTML + CSS + JavaScript Vanilla
- **Seguridad**: JWT + Helmet + Rate Limiting

## 📦 Instalación

```bash
# Clonar repositorio
git clone https://github.com/tu-usuario/galleta-domo.git
cd galleta-domo

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# Desplegar contrato en Polygon
npx hardhat run scripts/deploy.js --network polygon

# Iniciar servidor
npm start
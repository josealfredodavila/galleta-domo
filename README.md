# 🍪 Sariel's - Ecosistema WEB3

## 📋 Descripción

Plataforma web3 completa que combina:
- 🏠 **Venta física de domos de galleta** con QR únicos
- 🪙 **Tokens digitales (Es.stoks)** en Polygon
- 🎁 **NFTs como premios intransferibles** al acumular 12 tokens
- 👥 **Red social integrada** (perfil, muro, mensajería, contactos)
- 📊 **Mercado P2P** para tokens con precios dinámicos
- 🎥 **Streaming en vivo** (Live) con chat y donaciones
- 💳 **Pasarela de pagos** con NOWPayments (USDT/USDC)
- 📱 **eSIM Telnyx** para datos móviles
- 🔒 **Seguridad avanzada** (JWT + Helmet + Rate Limiting)

---

## ✨ Características

### 🏠 Sistema de Domos
- ✅ Compra de domos físicos con QR únicos
- ✅ 1 domo = 1 Es.stok
- ✅ 12 Es.stoks = 1 NFT
- ✅ Quema automática de tokens al canjear

### 👤 Perfil de Usuario
- ✅ Foto de perfil (Supabase Storage)
- ✅ Biografía, handle, nombre
- ✅ Estadísticas: tokens, NFTs, seguidores, siguiendo
- ✅ Estado activo/inactivo en tiempo real
- ✅ Amigos en línea con Realtime

### 📰 Muro Social
- ✅ Publicaciones con texto, imágenes y videos
- ✅ Likes y comentarios en tiempo real
- ✅ Hashtags (#) y menciones (@)
- ✅ Eliminar y editar publicaciones
- ✅ Reportar contenido ofensivo
- ✅ Guardar publicaciones favoritas
- ✅ Compartir en redes sociales
- ✅ Mercado P2P para tokens con precios dinámicos
- ✅ Recompensas por interacción (likes, comentarios)

### 💬 Mensajería
- ✅ Chat en tiempo real (Supabase Realtime)
- ✅ Buscar y agregar contactos
- ✅ Enviar imágenes y mensajes de voz
- ✅ Eliminar y editar mensajes
- ✅ Bloquear usuarios
- ✅ Estado de lectura (visto)
- ✅ Indicador de escritura

### 🎥 Live Streaming
- ✅ Transmisiones en vivo (LiveKit)
- ✅ Chat en vivo con moderación
- ✅ Donaciones con efectos visuales (5 niveles)
- ✅ Sistema de seguidores
- ✅ Notificaciones de inicio de transmisión
- ✅ Grabación de transmisiones (VOD)
- ✅ Dashboard de estadísticas

### 💰 Pagos y Comisiones
- ✅ Pasarela de pagos con NOWPayments
- ✅ Acepta USDT y USDC
- ✅ Comisión de plataforma: 2%
- ✅ Webhooks para confirmación automática
- ✅ Soporte para Polygon Amoy

### 📱 eSIM Telnyx
- ✅ Compra de paquetes de datos
- ✅ Gestión de datos en tiempo real
- ✅ Activación/desactivación de eSIM
- ✅ QR de activación

### 🔒 Seguridad
- ✅ Autenticación JWT con Supabase
- ✅ Helmet para cabeceras HTTP seguras
- ✅ Rate Limiting contra DDoS
- ✅ Validación de datos con express-validator
- ✅ CORS configurado
- ✅ RLS en Supabase

---

## 🛠️ Tecnologías

| Área | Tecnologías |
|------|-------------|
| **Blockchain** | Polygon (MATIC), MetaMask |
| **Backend** | Node.js, Express, Supabase |
| **Frontend** | HTML, CSS, JavaScript (Vanilla) |
| **Base de datos** | Supabase (PostgreSQL) |
| **Autenticación** | Supabase Auth, JWT |
| **Streaming** | LiveKit (WebRTC) |
| **Pagos** | NOWPayments (USDT/USDC) |
| **eSIM** | Telnyx |
| **Despliegue** | Railway (Backend) |
| **Seguridad** | Helmet, Rate Limiting, CORS, RLS |

---

## 📦 Instalación

```bash
# Clonar repositorio
git clone https://github.com/tuusuario/sariels-ecosistema.git
cd sariels-ecosistema

# Instalar dependencias del backend
cd backend
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# Ejecutar en desarrollo
npm run dev

# Ejecutar en producción
npm start
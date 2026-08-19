# 🍪 Galleta Domo - Ecosistema Sariel's

## 📋 Descripción

Plataforma web3 completa que combina:
- Venta física de domos de galleta
- Tokens digitales (Es.stoks) en Polygon
- NFTs como premios intransferibles
- Red social integrada (perfil, muro, mensajería)
- Mercado P2P para tokens
- Streaming en vivo (Muro Live)
- Pasarela de pagos con NowPayments

## ✨ Características

- ✅ Compra de domos con tokens Polygon (MATIC)
- ✅ Generación automática de QR por cada domo
- ✅ Acumulación de tokens (1 token por domo)
- ✅ Canje de NFT al acumular 12 tokens
- ✅ Quema automática de tokens al canjear
- ✅ Perfil de usuario con foto y estadísticas
- ✅ Muro con publicaciones, fotos, videos y ventas
- ✅ Mensajería en tiempo real (Socket.IO)
- ✅ Streaming en vivo (LiveKit)
- ✅ Mercado P2P para tokens
- ✅ Pasarela de pagos (NowPayments)
- ✅ Seguridad implementada (JWT + Helmet + Rate Limiting)
- ✅ Diseño futurista verde esmeralda
- ✅ Totalmente automatizado

## 🛠️ Tecnologías

| Área | Tecnologías |
|------|-------------|
| **Blockchain** | Polygon (MATIC), Solidity, OpenZeppelin |
| **Backend** | Node.js, Express, Socket.IO, MongoDB |
| **Frontend** | HTML, CSS, JavaScript (Vanilla) |
| **Autenticación** | JWT, MetaMask, Supabase |
| **Streaming** | LiveKit (WebRTC) |
| **Pagos** | NowPayments |
| **Despliegue** | Vercel (Frontend), Railway (Backend) |
| **Seguridad** | Helmet, Rate Limiting, CORS |

## 📦 Instalación

```bash
# Clonar repositorio
git clone https://github.com/josealfredodavila/galleta-domo.git
cd galleta-domo

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales